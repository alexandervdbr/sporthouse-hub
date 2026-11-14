import {
  createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync,
  randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

// Token, pincode en sleutels van de persoonlijke freelancerlink. Alleen
// server-side. Zie §4 van docs/freelancers-redesign.md.
//
// Nooit in plaintext opgeslagen of gelogd:
//   token  → sha256 (opzoeken) + AES-256-GCM (zodat "beheren" de link kan
//            kopiëren), met het freelancer-id als AAD
//   pin    → scrypt(HMAC(pepper, pin), salt). De pepper zit in de env var,
//            dus een gelekte database alleen is niet genoeg om de 10.000
//            mogelijke pincodes af te lopen.
//
// Eén geheim (FREELANCER_LINK_SECRET), drie sleutels via HKDF, zodat
// eenzelfde sleutel nooit voor twee doelen dient.

const scrypt = promisify(scryptCb) as (pw: Buffer, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>

const SECRET_ENV = 'FREELANCER_LINK_SECRET'
const MIN_SECRET_LENGTH = 32
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 }
const TOKEN_BYTES = 32

export class LinkSecretError extends Error {}

function masterSecret(): Buffer {
  const value = process.env[SECRET_ENV]
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new LinkSecretError(
      `${SECRET_ENV} ontbreekt of is korter dan ${MIN_SECRET_LENGTH} tekens. ` +
      'Zet hem in Vercel (en .env.local); zonder kunnen er geen freelancerlinks gemaakt of geopend worden.',
    )
  }
  return Buffer.from(value, 'utf8')
}

export type KeyPurpose = 'link-token-enc' | 'link-cookie-mac' | 'link-pin-pepper' | 'link-rate-key'

export function subkey(purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', masterSecret(), Buffer.alloc(0), purpose, 32))
}

// ── Token ───────────────────────────────────────────────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function isTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

/** AES-256-GCM: iv (12) || tag (16) || ciphertext. Het freelancer-id is AAD. */
export function encryptToken(token: string, freelancerId: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', subkey('link-token-enc'), iv)
  cipher.setAAD(Buffer.from(freelancerId, 'utf8'))
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

export function decryptToken(blob: Buffer, freelancerId: string): string {
  if (blob.length < 12 + 16 + 1) throw new Error('Ongeldige versleutelde link.')
  const decipher = createDecipheriv('aes-256-gcm', subkey('link-token-enc'), blob.subarray(0, 12))
  decipher.setAAD(Buffer.from(freelancerId, 'utf8'))
  decipher.setAuthTag(blob.subarray(12, 28))
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8')
}

/** De link zelf. Het token staat achter # zodat het nooit in een request-log komt. */
export function linkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/f#${token}`
}

// ── Pincode ─────────────────────────────────────────────────────────────────

const PIN_RE = /^\d{4}$/

export function newPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0')
}

export function isPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_RE.test(pin)
}

function pepper(pin: string): Buffer {
  return createHmac('sha256', subkey('link-pin-pepper')).update(pin, 'utf8').digest()
}

export async function hashPin(pin: string): Promise<string> {
  if (!isPinFormat(pin)) throw new Error('Ongeldige pincode.')
  const salt = randomBytes(16)
  const { N, r, p, keylen } = SCRYPT
  const hash = await scrypt(pepper(pin), salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 })
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

/** Vergelijkt timing-safe. Een fout formaat of een kapotte hash is gewoon "fout". */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!isPinFormat(pin)) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(pepper(pin), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ── bytea via PostgREST ─────────────────────────────────────────────────────

export function toPgBytea(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`
}

export function fromPgBytea(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.startsWith('\\x')) throw new Error('Geen bytea-waarde.')
  return Buffer.from(value.slice(2), 'hex')
}
