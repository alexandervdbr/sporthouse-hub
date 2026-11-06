import { after } from 'next/server'
import { requireGear, dbErrorResponse, needsResponsibleAck, RESPONSIBLE_ACK_TEXT } from '@/lib/gear/server'
import { datesChanged, sendBookingCancellation, sendBookingConfirmation } from '@/lib/gear/mail-server'
import { parseBookingInput } from '@/lib/gear/booking-input'

// PATCH — een boeking wijzigen (periode, units, voor wie, klant, project,
// notitie) in één keer. DELETE — annuleren: de boeking blijft bewaard voor
// de geschiedenis, maar houdt niets meer bezet. Wie wat mag, controleert
// de database (eigen boekingen, of Beheren voor die van iedereen). Nieuwe
// data geven, los van het antwoord, een nieuwe bevestigingsmail (het
// agenda-item verschuift); annuleren een annuleringsmail (het item verdwijnt).

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

  const { data: before } = await supabase.from('gear_bookings').select('start_date, end_date, start_time, end_time').eq('id', id).maybeSingle()
  const { error } = await supabase.rpc('gear_update_booking', { p_booking_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  if (datesChanged(before, parsed.args)) after(() => sendBookingConfirmation(id, true))
  return new Response(null, { status: 204 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase.rpc('gear_cancel_booking', { p_booking_id: id })
  if (error) return dbErrorResponse(error)
  after(() => sendBookingCancellation(id))
  return new Response(null, { status: 204 })
}
