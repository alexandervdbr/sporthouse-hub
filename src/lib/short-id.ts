// A UUID is 16 bytes written as 36 characters. Written as base64url it's 22,
// which takes roughly 40 characters off a share link carrying two of them.
//
// Shared by the browser that builds a link and the server that reads one, so
// both sides can't drift apart on the format.
//
// Decoding is deliberately forgiving: anything that isn't a valid short id is
// handed back untouched, so a plain UUID — in an older link, or typed by
// hand — keeps working.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_PATTERN = /^[A-Za-z0-9_-]{22}$/

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  // btoa exists in both the browser and the Node runtime these routes use.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function shortenUuid(uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) return uuid
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytesToBase64Url(bytes)
}

export function expandUuid(value: string): string {
  if (!SHORT_PATTERN.test(value)) return value
  const bytes = base64UrlToBytes(value)
  if (!bytes || bytes.length !== 16) return value
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
