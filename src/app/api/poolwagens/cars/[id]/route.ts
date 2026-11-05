import { requirePoolwagens, dbErrorResponse, poolDbErrorText } from '@/lib/poolwagens/server'
import { parseCarInput } from '@/lib/poolwagens/car-input'
import { CAR_COLUMNS } from '@/lib/poolwagens/types'

// PATCH — een wagen wijzigen (beheer): gegevens, kilometerstand, handmatig
// niet beschikbaar, archiveren of terugzetten. Verwijderen bestaat niet: een
// wagen wordt gearchiveerd, zodat zijn historiek blijft.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const parsed = parseCarInput(await req.json().catch(() => null), true)
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.from('pool_cars').update(parsed.row).eq('id', id).select(CAR_COLUMNS).single()
  if (error) {
    // Twee unieke indexen: de nummerplaat en de naam (0080). De melding zegt welke.
    if (error.code === '23505') return new Response(poolDbErrorText(error), { status: 409 })
    return dbErrorResponse(error)
  }
  return Response.json(data)
}
