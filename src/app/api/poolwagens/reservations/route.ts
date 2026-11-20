import { after } from 'next/server'
import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseReservationInput, rpcArgs } from '@/lib/poolwagens/reservation-input'
import { sendReservationConfirmation } from '@/lib/poolwagens/notify'

// POST — een wagen reserveren via pool_create_reservation. Overlap, blokkade
// en rechten controleert de database; overlappend geeft een 409.
export async function POST(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = parseReservationInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.rpc('pool_create_reservation', rpcArgs(parsed.args))
  if (error) return dbErrorResponse(error)
  // De bevestigingsmail na het antwoord: de gebruiker wacht er niet op. Het
  // adres van een stagiair zonder account staat nergens in de database; het
  // gaat alleen hier mee.
  const guestEmail = parsed.args.p_guest_email
  after(() => sendReservationConfirmation(data as string, { guestEmail }))
  return Response.json({ id: data }, { status: 201 })
}
