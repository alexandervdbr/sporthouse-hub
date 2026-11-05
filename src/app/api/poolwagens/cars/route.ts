import { requirePoolwagens, dbErrorResponse, poolDbErrorText } from '@/lib/poolwagens/server'
import { parseCarInput } from '@/lib/poolwagens/car-input'
import { CAR_COLUMNS } from '@/lib/poolwagens/types'

// GET — de wagens. Standaard alleen de actieve; ?archived=1 (alleen voor
// beheer) geeft ook de gearchiveerde.
// POST — een wagen toevoegen (beheer). RLS weigert het opnieuw voor wie geen
// poolwagens_beheren heeft.

export async function GET(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, access } = auth

  const withArchived = new URL(req.url).searchParams.get('archived') === '1'
  if (withArchived && !access.manage) return new Response('Je hebt hier geen rechten voor.', { status: 403 })

  let query = supabase.from('pool_cars').select(CAR_COLUMNS).order('name')
  if (!withArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) return dbErrorResponse(error)
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = parseCarInput(await req.json().catch(() => null), false)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.from('pool_cars').insert(parsed.row).select(CAR_COLUMNS).single()
  if (error) {
    // Twee unieke indexen: de nummerplaat en de naam (0080). De melding zegt welke.
    if (error.code === '23505') return new Response(poolDbErrorText(error), { status: 409 })
    return dbErrorResponse(error)
  }
  return Response.json(data, { status: 201 })
}
