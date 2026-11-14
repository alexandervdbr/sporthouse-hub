import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidCronSecret } from '@/lib/cron-auth'
import { revokeExpiredShares, sweepAllShares } from '@/features/freelancers/lib/files-server'

export const maxDuration = 300

// Publieke Drive-delingen van freelancerbestanden intrekken (V1).
//   ?modus=uur  (standaard) — elke vastgelegde deling ouder dan 1 uur
//   ?modus=nacht            — vangnet: kijkt bij Drive zelf naar ELKE
//                             "iedereen"-deling op elk freelancerbestand, ook
//                             delingen die nooit in de database stonden, en logt
// Beveiligd met CRON_SECRET (Authorization: Bearer …), zoals de andere crons.
//
// De middleware laat precies deze route door zonder login (optie a); de
// andere /api/cron/*-routes niet. Daarnaast ruimt elke download de verlopen
// delingen op (after() in de downloadroute), als vangnet.
export async function GET(req: Request) {
  const auth = (await headers()).get('authorization')
  if (!isValidCronSecret(auth)) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const modus = new URL(req.url).searchParams.get('modus') === 'nacht' ? 'nacht' : 'uur'
  const expired = await revokeExpiredShares(admin, Date.now(), 500)
  const nacht = modus === 'nacht' ? await sweepAllShares(admin) : null
  return Response.json({ modus, verlopen: expired, nacht })
}
