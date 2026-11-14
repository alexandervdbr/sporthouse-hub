import { createAdminClient } from '@/lib/supabase/server'
import { invalidLink, json, limit, lockState, resolveToken, sameOrigin } from '@/features/freelancers/lib/public-server'
import { pinSchema, readBody } from '@/features/freelancers/lib/public-schemas'
import { verifyPin } from '@/features/freelancers/lib/link-crypto'
import { setSessionCookies, signSession } from '@/features/freelancers/lib/link-session'
import { LOCKOUTS_BEFORE_HARD_LOCK, LOCKOUT_WINDOW_HOURS, PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from '@/features/freelancers/lib/config'

// POST {token, pin} — de pincode controleren (timing-safe, gepeperde scrypt).
// Juist  → cookie (30 dagen, alleen /f en /api/public/f) en {state: 'ok'}.
// Fout   → teller +1, atomair in de database; na 5 fouten 15 minuten dicht,
//          na 3 blokkeringen binnen 24 u dicht tot het team een nieuwe pincode maakt.
// De pincode zelf wordt nergens opgeslagen of gelogd.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Ongeldig verzoek.' }, 403)
  const db = createAdminClient()
  const limited = await limit(db, req, 'pin')
  if (limited) return limited

  const body = await readBody(req, pinSchema)
  if (!body) return json({ error: 'Ongeldig verzoek.' }, 400)

  const link = await resolveToken(db, body.token)
  if (!link) return invalidLink()

  const lock = lockState(link)
  if (lock.locked) return json({ state: 'geblokkeerd', until: lock.until, needsNewPin: lock.needsNewPin }, 423)

  if (await verifyPin(body.pin, link.pin_hash)) {
    await db.rpc('freelancer_link_pin_ok', { p_link_id: link.id })
    const headers = new Headers()
    setSessionCookies(headers, signSession(link.id, link.pin_hash))
    return json({ state: 'ok' }, 200, headers)
  }

  const { data, error } = await db.rpc('freelancer_link_pin_failed', {
    p_link_id: link.id, p_max: PIN_MAX_ATTEMPTS, p_lock_minutes: PIN_LOCK_MINUTES,
    p_hard: LOCKOUTS_BEFORE_HARD_LOCK, p_window_hours: LOCKOUT_WINDOW_HOURS,
  })
  const r = (Array.isArray(data) ? data[0] : data) as { failed: number; locked_until: string | null; needs_new_pin: boolean } | null
  if (error || !r) return json({ error: 'Er ging iets mis. Probeer opnieuw.' }, 500)

  if (r.needs_new_pin) return json({ state: 'geblokkeerd', until: null, needsNewPin: true }, 423)
  if (r.locked_until && Date.parse(r.locked_until) > Date.now()) {
    return json({ state: 'geblokkeerd', until: r.locked_until, needsNewPin: false }, 423)
  }
  return json({ state: 'pin', attemptsLeft: PIN_MAX_ATTEMPTS - r.failed }, 401)
}
