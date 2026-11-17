import { after } from 'next/server'
import { requireGear, dbErrorResponse, needsResponsibleAck, RESPONSIBLE_ACK_TEXT } from '@/lib/gear/server'
import { calendarAfterMerge, syncBookingCalendar } from '@/lib/gear/mail-server'
import { isISODate } from '@/lib/gear/dates'
import { parseBookingInput } from '@/lib/gear/booking-input'
import { BOOKING_SELECT, shapeBookings } from '@/lib/gear/booking-rows'
import type { MergeResult } from '@/lib/gear/types'

// GET ?start=&end= — de niet-geannuleerde boekingen die dat venster raken
// (de planner vraagt één maand tegelijk, niet de hele tabel).
// POST — boeken via gear_create_booking; de database controleert alles.
// Daarna, los van het antwoord, de afspraak in de agenda. Geen mail bij
// boeken. Met merge_into: meteen toevoegen aan een bestaande boeking.

export async function GET(req: Request) {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const url = new URL(req.url)
  const start = url.searchParams.get('start') ?? ''
  const end = url.searchParams.get('end') ?? ''
  if (!isISODate(start) || !isISODate(end) || end < start) return new Response('start en end zijn verplicht', { status: 400 })

  const { data, error } = await supabase
    .from('gear_bookings')
    .select(BOOKING_SELECT)
    .is('cancelled_at', null)
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date')
  if (error) return dbErrorResponse(error)
  return Response.json(await shapeBookings(data))
}

export async function POST(req: Request) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const parsed = parseBookingInput(body)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })
  if (body?.responsible_ack !== true && await needsResponsibleAck(supabase, parsed.args)) {
    return new Response(RESPONSIBLE_ACK_TEXT, { status: 400 })
  }

  // "Ja, toevoegen" aan een bestaande boeking met exact dezelfde periode:
  // boeken en samenvoegen in één stap in de database. Geen mail; de afspraak
  // van de bestaande boeking krijgt het nieuwe materiaal erbij.
  const into = typeof body?.merge_into === 'string' ? body.merge_into : null
  if (into) {
    const keep = body?.keep === 'new' ? 'new' : 'existing'
    const { data, error } = await supabase.rpc('gear_create_booking_into', { p_into_booking_id: into, p_keep: keep, ...parsed.args })
    if (error) return dbErrorResponse(error)
    const r = data as MergeResult
    after(() => calendarAfterMerge(r.target_id, r.absorbed_ids))
    return Response.json({ id: r.target_id, merge_id: r.merge_id, created_id: r.created_id }, { status: 201 })
  }

  const { data, error } = await supabase.rpc('gear_create_booking', parsed.args)
  if (error) return dbErrorResponse(error)
  after(() => syncBookingCalendar(data as string))
  return Response.json({ id: data }, { status: 201 })
}
