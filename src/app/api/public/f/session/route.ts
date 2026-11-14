import { createAdminClient } from '@/lib/supabase/server'
import { invalidLink, json, limit, lockState, resolveSession, resolveToken, sameOrigin } from '@/features/freelancers/lib/public-server'
import { readBody, sessionSchema } from '@/features/freelancers/lib/public-schemas'
import { PIN_MAX_ATTEMPTS } from '@/features/freelancers/lib/config'

// POST {token?} — in welke staat is deze link voor deze browser?
//   ok          — de cookie hoort bij deze link en klopt nog
//   pin         — pincode nodig (+ aantal pogingen over)
//   geblokkeerd — te veel foute pogingen (+ tot wanneer, of: nieuwe pincode nodig)
//   ongeldig    — onbekend, ingetrokken of gearchiveerd: altijd hetzelfde antwoord
// Zonder token telt alleen een geldige cookie.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Ongeldig verzoek.' }, 403)
  const db = createAdminClient()
  const limited = await limit(db, req, 'session')
  if (limited) return limited

  const body = await readBody(req, sessionSchema)
  if (!body) return json({ error: 'Ongeldig verzoek.' }, 400)

  const session = await resolveSession(db, req)
  if (!body.token) return session ? json({ state: 'ok' }) : invalidLink()

  const link = await resolveToken(db, body.token)
  if (!link) return invalidLink()
  if (session?.id === link.id) return json({ state: 'ok' })

  const lock = lockState(link)
  if (lock.locked) return json({ state: 'geblokkeerd', until: lock.until, needsNewPin: lock.needsNewPin })
  return json({ state: 'pin', attemptsLeft: PIN_MAX_ATTEMPTS - link.failed_pin_attempts })
}
