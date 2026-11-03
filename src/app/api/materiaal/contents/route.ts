import { requireGear, dbErrorResponse, optionalText, saveOrder } from '@/lib/gear/server'

// Inhoud van een kit: een checklist, geen materiaal dat los geboekt wordt.
// Alleen voor wie de catalogus beheert.

const COLUMNS = 'id, unit_id, label, quantity, note, sort_order'

function quantityOf(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const unitId = optionalText(body.unit_id)
  const label = optionalText(body.label)
  if (!unitId || !label) return new Response('Geef aan wat erin zit.', { status: 400 })

  const { data: last } = await supabase
    .from('gear_unit_contents').select('sort_order').eq('unit_id', unitId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('gear_unit_contents')
    .insert({ unit_id: unitId, label, quantity: quantityOf(body.quantity), note: optionalText(body.note), sort_order: (last?.sort_order ?? 0) + 1 })
    .select(COLUMNS).single()
  if (error) return dbErrorResponse(error)
  return Response.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  if ('order' in body) return saveOrder(supabase, 'gear_unit_contents', body.order)

  if (typeof body.id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const update: Record<string, unknown> = {}
  if ('label' in body) {
    const label = optionalText(body.label)
    if (!label) return new Response('De omschrijving mag niet leeg zijn.', { status: 400 })
    update.label = label
  }
  if ('quantity' in body) update.quantity = quantityOf(body.quantity)
  if ('note' in body) update.note = optionalText(body.note)

  const { data, error } = await supabase.from('gear_unit_contents').update(update).eq('id', body.id).select(COLUMNS).single()
  if (error) return dbErrorResponse(error)
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const { error } = await supabase.from('gear_unit_contents').delete().eq('id', id)
  if (error) return dbErrorResponse(error)
  return new Response(null, { status: 204 })
}
