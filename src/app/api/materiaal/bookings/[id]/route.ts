import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { parseBookingInput } from '@/lib/gear/booking-input'

// PATCH — een boeking wijzigen (periode, units, voor wie, klant, project,
// notitie) in één keer. DELETE — annuleren: de boeking blijft bewaard voor
// de geschiedenis, maar houdt niets meer bezet. Wie wat mag, controleert
// de database (eigen boekingen, of Beheren voor die van iedereen).

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseBookingInput(await req.json())
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { error } = await supabase.rpc('gear_update_booking', { p_booking_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase.rpc('gear_cancel_booking', { p_booking_id: id })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
