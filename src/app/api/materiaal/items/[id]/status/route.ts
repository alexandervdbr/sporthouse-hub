import { requireGear, dbErrorResponse, optionalText } from '@/lib/gear/server'
import { isUnitStatus } from '@/lib/gear/status'

// Status melden of herstellen. Wie mag boeken, mag defect of beperkt melden;
// herstellen en uit dienst nemen controleert de database (gear_set_item_status).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = await req.json()
  if (typeof body.status !== 'string' || !isUnitStatus(body.status)) {
    return new Response('Onbekende status.', { status: 400 })
  }

  const { error } = await supabase.rpc('gear_set_item_status', { p_item_id: id, p_status: body.status, p_note: optionalText(body.note) })
  if (error) return dbErrorResponse(error)

  const { data, error: readError } = await supabase.from('gear_items').select('id, status, status_note').eq('id', id).single()
  if (readError) return dbErrorResponse(readError)
  return Response.json(data)
}
