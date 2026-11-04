import { requirePoolwagens, dbErrorResponse, readJson } from '@/lib/poolwagens/server'
import { parseArrivalInput } from '@/lib/poolwagens/reservation-input'

// POST — aankomst registreren. De km-stand is minstens die bij vertrek; de
// wagen krijgt de nieuwe stand (pool_register_arrival).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseArrivalInput(await readJson(req))
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { error } = await supabase.rpc('pool_register_arrival', { p_id: id, ...parsed.args })
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
