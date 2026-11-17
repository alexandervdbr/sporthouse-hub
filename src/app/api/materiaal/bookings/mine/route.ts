import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { addDays, isISODate, todayInBrussels } from '@/lib/gear/dates'
import { BOOKING_SELECT, shapeBookings } from '@/lib/gear/booking-rows'

// GET — "Mijn boekingen": de niet-geannuleerde boekingen voor mij of door
// mij gemaakt, die nog lopen of komen, plus de afgelopen tot `since`
// (standaard 30 dagen terug; "meer tonen" schuift dat op).
// ?all=1 — met Beheren: die van iedereen (filteren en zoeken doet het scherm).
// Eén keer laden bij openen; geen timer.

const LIMIT = 500

export async function GET(req: Request) {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth

  const url = new URL(req.url)
  const today = todayInBrussels()
  const sinceParam = url.searchParams.get('since') ?? ''
  const since = isISODate(sinceParam) ? sinceParam : addDays(today, -30)
  const all = url.searchParams.get('all') === '1'
  if (all && !access.manageBookings) return new Response('Je hebt hier geen rechten voor.', { status: 403 })

  let q = supabase.from('gear_bookings').select(BOOKING_SELECT)
    .is('cancelled_at', null)
    .gte('end_date', since)
  if (!all) q = q.or(`created_by.eq.${user.id},booked_for_user_id.eq.${user.id}`)
  const { data, error } = await q.order('start_date').order('start_time', { nullsFirst: true }).limit(LIMIT)
  if (error) return dbErrorResponse(error)
  return Response.json({ since, bookings: await shapeBookings(data), truncated: (data?.length ?? 0) >= LIMIT })
}
