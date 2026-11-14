import { timingSafeEqual } from 'crypto'

// Plain !== on a secret is vulnerable in principle to a timing side-channel
// (impractical over real network jitter for a bearer-token-gated, non-browser
// endpoint like these cron routes, but free to close off properly).
// timingSafeEqual requires equal-length buffers, so length is checked first —
// that itself leaks length, which is fine, a bearer secret's length isn't
// the sensitive part.
//
// Ontbreekt CRON_SECRET (of is hij leeg of alleen spaties), dan is ELKE
// aanroep ongeldig. Vroeger werd de verwachte waarde dan letterlijk
// "Bearer undefined" — wie die header stuurde, kwam binnen.
export function isValidCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !secret.trim()) return false
  const expected = `Bearer ${secret}`
  const provided = authHeader ?? ''
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}
