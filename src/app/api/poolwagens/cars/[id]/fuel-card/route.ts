import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseFuelCardInput } from '@/lib/poolwagens/fuel-card'
import { CAR_COLUMNS } from '@/lib/poolwagens/types'

// PUT — tankkaart en pincode van een wagen instellen (beheer), via
// pool_set_fuel_card (0087). Een leeg nummer wist het nummer; een lege
// pincode laat de bestaande staan; clear_pin wist ze. Antwoordt met de wagen
// (met de nieuwe laatste vier tekens), nooit met de pincode.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseFuelCardInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })
  const { card_number, pin, clear_pin } = parsed.input

  const { error } = await supabase.rpc('pool_set_fuel_card', {
    p_car_id: id, p_card_number: card_number, p_pin: pin, p_clear_pin: clear_pin,
  })
  if (error) return dbErrorResponse(error)

  const { data, error: readError } = await supabase.from('pool_cars').select(CAR_COLUMNS).eq('id', id).single()
  if (readError) return dbErrorResponse(readError)
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
