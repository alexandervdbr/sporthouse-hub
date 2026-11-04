import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseReservationInput } from '@/lib/poolwagens/reservation-input'

// PATCH — een reservatie wijzigen (wagen, periode, project, notitie).
// DELETE — annuleren; blijft bewaard maar houdt niets meer bezet.
// Eigen reservatie zolang de rit niet gestart is, of beheer: dat beslist de
// database (pool_update_reservation, pool_cancel_reservation).

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseReservationInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { error } = await supabase.rpc('pool_update_reservation', { p_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase.rpc('pool_cancel_reservation', { p_id: id })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
