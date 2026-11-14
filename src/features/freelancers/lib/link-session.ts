import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { subkey } from './link-crypto'

// De cookie na een juiste pincode. GEEN Supabase-sessie: de middleware ziet
// geen ingelogde gebruiker, dus elke interne route blijft dicht (401).
//
// Inhoud: alleen link-id en vervaldatum, plus een HMAC. Die HMAC rekent ook
// een vingerafdruk van de huidige pincode-hash mee, zonder dat die in de
// cookie staat: een nieuwe pincode maakt zo elke bestaande sessie ongeldig.
//
// Twee cookies met dezelfde waarde, want een cookie heeft maar één pad:
// /f (de pagina) en /api/public/f (de API). Nergens anders wordt hij
// meegestuurd.

export const COOKIE_NAME = 'sh_fl'
export const COOKIE_PATHS = ['/f', '/api/public/f'] as const
export const SESSION_DAYS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mac(linkId: string, exp: number, pinHash: string): Buffer {
  const pinPrint = createHash('sha256').update(pinHash).digest('base64url')
  return createHmac('sha256', subkey('link-cookie-mac')).update(`${linkId}.${exp}.${pinPrint}`).digest()
}

export function signSession(linkId: string, pinHash: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400
  return `${linkId}.${exp}.${mac(linkId, exp, pinHash).toString('base64url')}`
}

/** Alleen de vorm lezen; de echte controle volgt met verifySession, met de pincode-hash uit de database. */
export function parseSession(value: string | null | undefined): { linkId: string; exp: number; sig: string } | null {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [linkId, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!UUID.test(linkId) || !Number.isInteger(exp) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null
  return { linkId, exp, sig }
}

export function verifySession(value: string | null | undefined, pinHash: string, now = Date.now()): string | null {
  const p = parseSession(value)
  if (!p || p.exp * 1000 <= now) return null
  const expected = mac(p.linkId, p.exp, pinHash)
  const given = Buffer.from(p.sig, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected) ? p.linkId : null
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE_NAME) return v.join('=')
  }
  return null
}

function cookieLine(value: string, path: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

export function setSessionCookies(headers: Headers, value: string): void {
  for (const path of COOKIE_PATHS) headers.append('Set-Cookie', cookieLine(value, path, SESSION_DAYS * 86400))
}

export function clearSessionCookies(headers: Headers): void {
  for (const path of COOKIE_PATHS) headers.append('Set-Cookie', cookieLine('', path, 0))
}
