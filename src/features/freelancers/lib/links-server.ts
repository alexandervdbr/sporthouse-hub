import type { SupabaseClient } from '@supabase/supabase-js'
import { SITE_URL } from '@/lib/site-url'
import {
  decryptToken, encryptToken, fromPgBytea, hashPin, hashToken, linkUrl, newPin, newToken, toPgBytea,
} from './link-crypto'
import { LOCKOUTS_BEFORE_HARD_LOCK, LOCKOUT_WINDOW_HOURS } from './config'

// Beheer van de persoonlijke link (alleen de interne API, niveau "beheren").
// freelancer_links heeft geen policies: alles hier loopt via de service-role.
//
// De pincode verlaat deze module precies één keer: als returnwaarde van
// createLink of replacePin. Hij wordt nergens opgeslagen of gelogd.

type Db = SupabaseClient

export type LinkStatus =
  | { state: 'geen' }
  | {
      state: 'actief' | 'geblokkeerd'
      created_at: string
      last_opened_at: string | null
      locked_until: string | null
      /** Na herhaalde blokkeringen: dicht tot er een nieuwe pincode is. */
      needs_new_pin: boolean
    }

interface LinkRow {
  id: string
  token_encrypted: string
  created_at: string
  last_opened_at: string | null
  locked_until: string | null
  lockout_count: number
  lockout_window_start: string | null
}

async function activeLink(db: Db, freelancerId: string): Promise<LinkRow | null> {
  const { data, error } = await db
    .from('freelancer_links')
    .select('id, token_encrypted, created_at, last_opened_at, locked_until, lockout_count, lockout_window_start')
    .eq('freelancer_id', freelancerId)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new Error('Kon de link niet lezen.')
  return (data as LinkRow | null) ?? null
}

export function needsNewPin(l: Pick<LinkRow, 'lockout_count' | 'lockout_window_start'>, now = Date.now()): boolean {
  if (l.lockout_count < LOCKOUTS_BEFORE_HARD_LOCK || !l.lockout_window_start) return false
  return now - Date.parse(l.lockout_window_start) < LOCKOUT_WINDOW_HOURS * 3600_000
}

export async function linkStatus(db: Db, freelancerId: string, now = Date.now()): Promise<LinkStatus> {
  const l = await activeLink(db, freelancerId)
  if (!l) return { state: 'geen' }
  const hard = needsNewPin(l, now)
  const locked = hard || (!!l.locked_until && Date.parse(l.locked_until) > now)
  return {
    state: locked ? 'geblokkeerd' : 'actief',
    created_at: l.created_at,
    last_opened_at: l.last_opened_at,
    locked_until: l.locked_until,
    needs_new_pin: hard,
  }
}

async function assertActiveFreelancer(db: Db, freelancerId: string): Promise<'ok' | 'niet_gevonden' | 'gearchiveerd'> {
  const { data } = await db.from('freelancers').select('id, archived_at').eq('id', freelancerId).maybeSingle()
  if (!data) return 'niet_gevonden'
  return data.archived_at ? 'gearchiveerd' : 'ok'
}

export type CreatedLink = { ok: true; url: string; pin: string } | { ok: false; status: 404 | 409 | 500; error: string }

/**
 * Nieuwe link (en pincode). Een bestaande link wordt eerst ingetrokken: de
 * oude werkt meteen niet meer.
 */
export async function createLink(db: Db, freelancerId: string, createdBy: string): Promise<CreatedLink> {
  const check = await assertActiveFreelancer(db, freelancerId)
  if (check === 'niet_gevonden') return { ok: false, status: 404, error: 'Freelancer niet gevonden.' }
  if (check === 'gearchiveerd') return { ok: false, status: 409, error: 'Deze freelancer is gearchiveerd. Zet hem eerst terug.' }

  const token = newToken()
  const pin = newPin()
  const pinHash = await hashPin(pin)

  const { error: revokeError } = await db.from('freelancer_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('freelancer_id', freelancerId).is('revoked_at', null)
  if (revokeError) return { ok: false, status: 500, error: 'Kon de oude link niet intrekken.' }

  const { error } = await db.from('freelancer_links').insert({
    freelancer_id: freelancerId,
    token_hash: toPgBytea(hashToken(token)),
    token_encrypted: toPgBytea(encryptToken(token, freelancerId)),
    pin_hash: pinHash,
    created_by: createdBy,
  })
  if (error) return { ok: false, status: 500, error: 'Kon de link niet aanmaken.' }
  return { ok: true, url: linkUrl(SITE_URL, token), pin }
}

/** Nieuwe pincode op dezelfde link; heft ook elke blokkering op. */
export async function replacePin(db: Db, freelancerId: string): Promise<{ ok: true; pin: string } | { ok: false; status: 404 | 500; error: string }> {
  const l = await activeLink(db, freelancerId)
  if (!l) return { ok: false, status: 404, error: 'Er is geen actieve link.' }
  const pin = newPin()
  const { error } = await db.from('freelancer_links').update({
    pin_hash: await hashPin(pin),
    failed_pin_attempts: 0,
    locked_until: null,
    lockout_count: 0,
    lockout_window_start: null,
  }).eq('id', l.id)
  if (error) return { ok: false, status: 500, error: 'Kon de pincode niet vervangen.' }
  return { ok: true, pin }
}

export async function revokeLink(db: Db, freelancerId: string): Promise<boolean> {
  const { data, error } = await db.from('freelancer_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('freelancer_id', freelancerId).is('revoked_at', null)
    .select('id')
  if (error) throw new Error('Kon de link niet intrekken.')
  return (data ?? []).length > 0
}

/** De bestaande link opnieuw tonen om te kopiëren (zonder pincode). */
export async function currentLinkUrl(db: Db, freelancerId: string): Promise<string | null> {
  const l = await activeLink(db, freelancerId)
  if (!l) return null
  return linkUrl(SITE_URL, decryptToken(fromPgBytea(l.token_encrypted), freelancerId))
}
