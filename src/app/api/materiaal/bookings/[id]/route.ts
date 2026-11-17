import { createClient } from '@/lib/supabase/server'
import { after } from 'next/server'
import { requireGear, dbErrorResponse, needsResponsibleAck, RESPONSIBLE_ACK_TEXT } from '@/lib/gear/server'
import { bookingChanged, removeBookingCalendar, sendBookingChanges, syncBookingCalendar } from '@/lib/gear/mail-server'
import { parseBookingInput } from '@/lib/gear/booking-input'

// PATCH — een boeking wijzigen (periode, units, voor wie, klant, project,
// notitie) in één keer. DELETE — annuleren: de boeking blijft bewaard voor
// de geschiedenis, maar houdt niets meer bezet. Wie wat mag, controleert
// de database (eigen boekingen, of Beheren voor die van iedereen).
//
// Na het antwoord: andere data, uren of ander materiaal geven een
// wijzigingsmail (en de afspraak verschuift); een andere wijziging werkt
// alleen de afspraak bij. Annuleren haalt de afspraak weg, zonder mail.

type Snapshot = { start_date: string; end_date: string; start_time: string | null; end_time: string | null; item_ids: string[] }

async function snapshot(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<Snapshot | null> {
  const { data } = await supabase.from('gear_bookings')
    .select('start_date, end_date, start_time, end_time, gear_booking_items(item_id)').eq('id', id).maybeSingle()
  if (!data) return null
  const { gear_booking_items, ...b } = data as Omit<Snapshot, 'item_ids'> & { gear_booking_items: { item_id: string }[] }
  return { ...b, item_ids: (gear_booking_items ?? []).map(l => l.item_id) }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = await req.json()
  const parsed = parseBookingInput(body)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })
  if (body?.responsible_ack !== true && await needsResponsibleAck(supabase, parsed.args)) {
    return new Response(RESPONSIBLE_ACK_TEXT, { status: 400 })
  }

  const before = await snapshot(supabase, id)
  const { error } = await supabase.rpc('gear_update_booking', { p_booking_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  const now = await snapshot(supabase, id)
  after(() => (bookingChanged(before, now) ? sendBookingChanges([id]) : syncBookingCalendar(id)))
  return new Response(null, { status: 204 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase.rpc('gear_cancel_booking', { p_booking_id: id })
  if (error) return dbErrorResponse(error)
  after(() => removeBookingCalendar(id))
  return new Response(null, { status: 204 })
}
