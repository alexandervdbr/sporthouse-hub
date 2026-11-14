import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { hashToken, isTokenFormat, toPgBytea } from './link-crypto'
import { parseSession, readSessionCookie, verifySession } from './link-session'
import { clientIp, rateHit, type Bucket } from './rate-limit'
import { needsNewPin } from './links-server'

// De poort van elke publieke route (/api/public/f/*). Strikt gescheiden van
// de interne API: geen import van interne handlers, alleen de service-role,
// en de freelancer volgt ALTIJD uit de link — nooit uit wat de browser zegt.

export type Db = SupabaseClient

export interface LinkRow {
  id: string
  freelancer_id: string
  pin_hash: string
  failed_pin_attempts: number
  locked_until: string | null
  lockout_count: number
  lockout_window_start: string | null
}
const LINK_COLUMNS = 'id, freelancer_id, pin_hash, failed_pin_attempts, locked_until, lockout_count, lockout_window_start'

const PUBLIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

export function json(body: unknown, status = 200, extra?: Headers): Response {
  const headers = new Headers(PUBLIC_HEADERS)
  headers.set('Content-Type', 'application/json')
  extra?.forEach((v, k) => headers.append(k, v))
  return new Response(JSON.stringify(body), { status, headers })
}

/** Eén antwoord voor alles wat niet klopt: onbekend, ingetrokken of gearchiveerd. */
export const invalidLink = () => json({ state: 'ongeldig' }, 404)
const notLoggedIn = () => json({ state: 'pin' }, 401)
export const notFound = () => json({ error: 'Niet gevonden.' }, 404)
const tooMany = () => json({ error: 'Even te veel verzoeken. Probeer zo opnieuw.' }, 429)

async function activeLink(db: Db, column: 'token_hash' | 'id', value: string): Promise<LinkRow | null> {
  const { data } = await db.from('freelancer_links').select(LINK_COLUMNS)
    .eq(column, value).is('revoked_at', null).maybeSingle()
  if (!data) return null
  const { data: f } = await db.from('freelancers').select('archived_at').eq('id', data.freelancer_id).maybeSingle()
  if (!f || f.archived_at) return null
  return data as LinkRow
}

/** Token uit de link → actieve link, of null. Elke ongeldige reden geeft hetzelfde. */
export async function resolveToken(db: Db, token: unknown): Promise<LinkRow | null> {
  if (!isTokenFormat(token)) return null
  return activeLink(db, 'token_hash', toPgBytea(hashToken(token)))
}

/** Cookie → actieve link, als de cookie nog klopt met de huidige pincode. */
export async function resolveSession(db: Db, req: Request): Promise<LinkRow | null> {
  const raw = readSessionCookie(req)
  const parsed = parseSession(raw)
  if (!parsed) return null
  const link = await activeLink(db, 'id', parsed.linkId)
  if (!link || verifySession(raw, link.pin_hash) !== link.id) return null
  if (needsNewPin(link)) return null
  return link
}

export function lockState(link: LinkRow, now = Date.now()): { locked: boolean; until: string | null; needsNewPin: boolean } {
  const hard = needsNewPin(link, now)
  const timed = !!link.locked_until && Date.parse(link.locked_until) > now
  return { locked: hard || timed, until: hard ? null : timed ? link.locked_until : null, needsNewPin: hard }
}

/** Alleen verzoeken van onze eigen pagina's (CSRF), bovenop SameSite=Strict. */
export function sameOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

export async function limit(db: Db, req: Request, bucket: Bucket, key?: string): Promise<Response | null> {
  return (await rateHit(db, bucket, key ?? clientIp(req))) ? null : tooMany()
}

/**
 * Voor elke route achter de pincode: Origin, limiet per IP, en een geldige
 * sessie. Geeft de link (en dus de freelancer) terug, of het antwoord.
 */
export async function requireLinkSession(req: Request, bucket: Bucket): Promise<{ db: Db; link: LinkRow } | { error: Response }> {
  if (!sameOrigin(req)) return { error: json({ error: 'Ongeldig verzoek.' }, 403) }
  const db = createAdminClient()
  const limited = await limit(db, req, bucket)
  if (limited) return { error: limited }
  const link = await resolveSession(db, req)
  if (!link) return { error: notLoggedIn() }
  return { db, link }
}
