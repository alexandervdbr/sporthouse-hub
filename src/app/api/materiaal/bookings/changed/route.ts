import { after } from 'next/server'
import { requireGear } from '@/lib/gear/server'
import { sendBookingChanges } from '@/lib/gear/mail-server'

// POST { ids } — na een verhuis van kitonderdelen (één actie, soms meerdere
// verzoeken): de boekingen die daarbij bijgewerkt werden. Eén
// wijzigingsmail per persoon met al zijn boekingen. Alleen wie de catalogus
// beheert (die verhuist); het logboek zorgt dat dezelfde toestand nooit twee
// keer gemaild wordt, dus opnieuw aanroepen verstuurt niets nieuws.

export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 200) : []
  if (!ids.length) return new Response(null, { status: 204 })
  // Alleen boekingen die bestaan en zichtbaar zijn voor deze gebruiker.
  const { data } = await auth.supabase.from('gear_bookings').select('id').in('id', ids).is('cancelled_at', null)
  const found = (data ?? []).map(r => r.id as string)
  after(() => sendBookingChanges(found))
  return new Response(null, { status: 202 })
}
