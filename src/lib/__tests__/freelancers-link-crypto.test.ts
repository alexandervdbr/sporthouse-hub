import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  newToken, isTokenFormat, hashToken, encryptToken, decryptToken, linkUrl,
  newPin, isPinFormat, hashPin, verifyPin, subkey, toPgBytea, fromPgBytea, LinkSecretError,
} from '@/features/freelancers/lib/link-crypto'

const SECRET = 'test-geheim-dat-zeker-lang-genoeg-is-0123456789'
const F1 = '11111111-1111-4111-8111-111111111111'
const F2 = '22222222-2222-4222-8222-222222222222'

let saved: string | undefined
beforeEach(() => { saved = process.env.FREELANCER_LINK_SECRET; process.env.FREELANCER_LINK_SECRET = SECRET })
afterEach(() => { if (saved === undefined) delete process.env.FREELANCER_LINK_SECRET; else process.env.FREELANCER_LINK_SECRET = saved })

describe('FREELANCER_LINK_SECRET', () => {
  it('faalt duidelijk als hij ontbreekt of te kort is', () => {
    delete process.env.FREELANCER_LINK_SECRET
    expect(() => subkey('link-token-enc')).toThrow(LinkSecretError)
    expect(() => subkey('link-token-enc')).toThrow(/FREELANCER_LINK_SECRET ontbreekt/)
    process.env.FREELANCER_LINK_SECRET = 'kort'
    expect(() => encryptToken(newToken(), F1)).toThrow(LinkSecretError)
  })

  it('leidt per doel een andere sleutel af', () => {
    const keys = (['link-token-enc', 'link-cookie-mac', 'link-pin-pepper', 'link-rate-key'] as const).map(p => subkey(p).toString('hex'))
    expect(new Set(keys).size).toBe(4)
  })
})

describe('token', () => {
  it('32 willekeurige bytes, base64url, telkens anders', () => {
    const a = newToken(), b = newToken()
    expect(isTokenFormat(a)).toBe(true)
    expect(Buffer.from(a, 'base64url')).toHaveLength(32)
    expect(a).not.toBe(b)
    expect(isTokenFormat('x')).toBe(false)
    expect(isTokenFormat(a + '=')).toBe(false)
  })

  it('hash: sha256, 32 bytes, deterministisch', () => {
    const t = newToken()
    expect(hashToken(t)).toHaveLength(32)
    expect(hashToken(t).equals(hashToken(t))).toBe(true)
  })

  it('versleutelen en terughalen; niet met een ander freelancer-id of na knoeien', () => {
    const t = newToken()
    const blob = encryptToken(t, F1)
    expect(blob.toString('utf8')).not.toContain(t)
    expect(decryptToken(blob, F1)).toBe(t)
    expect(() => decryptToken(blob, F2)).toThrow()
    const tampered = Buffer.from(blob); tampered[tampered.length - 1] ^= 1
    expect(() => decryptToken(tampered, F1)).toThrow()
    expect(encryptToken(t, F1).equals(blob)).toBe(false) // nieuwe IV
  })

  it('de link zet het token achter #, nooit in het pad', () => {
    const t = newToken()
    const url = linkUrl('https://hub.example/', t)
    expect(url).toBe(`https://hub.example/f#${t}`)
    expect(new URL(url).pathname).toBe('/f')
  })

  it('bytea heen en terug', () => {
    const b = hashToken(newToken())
    expect(fromPgBytea(toPgBytea(b)).equals(b)).toBe(true)
    expect(() => fromPgBytea('geen')).toThrow()
  })
})

describe('pincode', () => {
  it('4 cijfers, ook met voorloopnullen', () => {
    for (let i = 0; i < 200; i++) expect(isPinFormat(newPin())).toBe(true)
    expect(isPinFormat('123')).toBe(false)
    expect(isPinFormat('12a4')).toBe(false)
    expect(isPinFormat(1234)).toBe(false)
  })

  it('juiste pincode klopt, foute niet; de hash bevat de pincode niet en is gezouten', async () => {
    const h1 = await hashPin('0427')
    const h2 = await hashPin('0427')
    expect(h1).not.toBe(h2)
    expect(h1).not.toContain('0427')
    expect(h1.startsWith('scrypt$32768$8$1$')).toBe(true)
    expect(await verifyPin('0427', h1)).toBe(true)
    expect(await verifyPin('0428', h1)).toBe(false)
    expect(await verifyPin('42', h1)).toBe(false)
    expect(await verifyPin('0427', 'kapot')).toBe(false)
  })

  it('met een ander geheim (andere pepper) klopt dezelfde pincode niet meer', async () => {
    const h = await hashPin('1234')
    process.env.FREELANCER_LINK_SECRET = SECRET + '-ander'
    expect(await verifyPin('1234', h)).toBe(false)
  })
})
