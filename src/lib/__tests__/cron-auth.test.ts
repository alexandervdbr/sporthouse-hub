import { describe, it, expect, afterEach } from 'vitest'
import { isValidCronSecret } from '@/lib/cron-auth'

// De cronroutes (/api/cron/*) vertrouwen op dit ene geheim.

const saved = process.env.CRON_SECRET
afterEach(() => { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved })

describe('isValidCronSecret', () => {
  it('ontbrekend geheim: elke header is ongeldig, ook "Bearer undefined"', () => {
    delete process.env.CRON_SECRET
    for (const h of ['Bearer undefined', 'Bearer ', 'Bearer', '', null]) expect(isValidCronSecret(h)).toBe(false)
  })

  it('leeg of alleen spaties: elke header is ongeldig', () => {
    for (const secret of ['', '   ']) {
      process.env.CRON_SECRET = secret
      for (const h of [`Bearer ${secret}`, 'Bearer ', 'Bearer undefined', null]) expect(isValidCronSecret(h)).toBe(false)
    }
  })

  it('juist geheim: geldig; al het andere niet', () => {
    process.env.CRON_SECRET = 'geheim-123'
    expect(isValidCronSecret('Bearer geheim-123')).toBe(true)
    for (const h of ['Bearer geheim-124', 'bearer geheim-123', 'geheim-123', 'Bearer geheim-123 ', null]) expect(isValidCronSecret(h)).toBe(false)
  })
})
