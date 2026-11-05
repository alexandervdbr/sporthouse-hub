import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseDepartureInput } from '@/lib/poolwagens/reservation-input'

// POST — vertrek registreren. Tijdstip standaard nu, km-stand standaard de
// laatst bekende van de wagen (pool_register_departure).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseDepartureInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { error } = await supabase.rpc('pool_register_departure', { p_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
