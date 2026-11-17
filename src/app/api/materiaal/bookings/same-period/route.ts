import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { canChangeBooking } from '@/lib/gear/access'
import { isISODate, todayInBrussels } from '@/lib/gear/dates'
import { BOOKING_SELECT, shapeBookings } from '@/lib/gear/booking-rows'
import { samePeriodMatches } from '@/lib/gear/merge'
import { normalizeTime } from '@/lib/gear/times'

// GET ?start_date&end_date&start_time&end_time&user_id&freelancer_id&external_name&client_id
// Vóór het opslaan van een NIEUWE boeking: heeft dezelfde persoon al een
// boeking met exact deze periode die je mag wijzigen? Dan stelt het formulier
// voor om het materiaal daaraan toe te voegen. Eén kleine query op de exacte
// data; geen timer.

export async function GET(req: Request) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth
  const p = new URL(req.url).searchParams
  const text = (k: string) => p.get(k)?.trim() || null
  const start = text('start_date') ?? '', end = text('end_date') ?? ''
  if (!isISODate(start) || !isISODate(end)) return new Response('start_date en end_date zijn verplicht', { status: 400 })

  const { data, error } = await supabase.from('gear_bookings').select(BOOKING_SELECT)
    .is('cancelled_at', null).eq('start_date', start).eq('end_date', end).limit(50)
  if (error) return dbErrorResponse(error)
  const today = todayInBrussels()
  const matches = samePeriodMatches({
    start_date: start, end_date: end, start_time: normalizeTime(text('start_time')), end_time: normalizeTime(text('end_time')),
    user_id: text('user_id'), freelancer_id: text('freelancer_id'), external_name: text('external_name'), client_id: text('client_id'),
  }, await shapeBookings(data), b => canChangeBooking(b, user.id, access, today))
  return Response.json(matches)
}
