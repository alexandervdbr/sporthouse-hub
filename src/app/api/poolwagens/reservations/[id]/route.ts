import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseReservationInput } from '@/lib/poolwagens/reservation-input'

// PATCH — een reservatie wijzigen (wagen, periode, klant, notitie).
// DELETE — annuleren; blijft bewaard maar houdt niets meer bezet.
// Wijzigen: eigen reservatie of rit zolang de wagen niet terug is, of beheer
// (een lopende rit niet naar een andere wagen; 0099).
// Annuleren: eigen reservatie of beheer, zolang de wagen niet terug is (een
// begonnen rit annuleren = niet gereden, 0096). Dat beslist de database
// (pool_update_reservation, pool_cancel_reservation).

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseReservationInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  // Voor wie verandert niet bij een wijziging: pool_update_reservation kent
  // die parameters niet, en PostgREST zoekt de functie op de namen.
  const { p_user_id: _u, p_guest_name: _n, p_guest_email: _e, ...args } = parsed.args
  void _u; void _n; void _e
  const { error } = await supabase.rpc('pool_update_reservation', { p_id: id, ...args })
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
