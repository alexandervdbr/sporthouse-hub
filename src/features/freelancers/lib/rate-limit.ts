import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { subkey, toPgBytea } from './link-crypto'

// Limiet op het aantal verzoeken naar de publieke link, per IP (of per link
// voor uploads). Telt in Postgres (public_rate_hit, migratie 0093): in-memory
// werkt niet op Fluid Compute, waar instanties geen geheugen delen.
//
// Het IP komt nooit in de database: alleen een HMAC ervan, met een sleutel
// uit FREELANCER_LINK_SECRET. Bovenop dit alles telt de pincode per link
// (5 pogingen), los van het IP.

export const LIMITS = {
  pin:     { limit: 10,  windowSeconds: 60 },
  session: { limit: 30,  windowSeconds: 60 },
  read:    { limit: 120, windowSeconds: 60 },
  write:   { limit: 30,  windowSeconds: 60 },
  upload:  { limit: 60,  windowSeconds: 3600 },
} as const
export type Bucket = keyof typeof LIMITS

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'onbekend'
}

/**
 * true = doorgaan. Bij een databasefout: false (dicht). Zonder werkende
 * database kan de link toch niets, en zo kan een storing nooit de limiet op
 * de pincode uitschakelen.
 */
export async function rateHit(db: SupabaseClient, bucket: Bucket, key: string): Promise<boolean> {
  const hashed = createHmac('sha256', subkey('link-rate-key')).update(`${bucket}:${key}`).digest()
  const { limit, windowSeconds } = LIMITS[bucket]
  const { data, error } = await db.rpc('public_rate_hit', {
    p_bucket: bucket, p_key: toPgBytea(hashed), p_limit: limit, p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('Freelancers: rate limit niet te controleren:', error.message)
    return false
  }
  return data === true
}
