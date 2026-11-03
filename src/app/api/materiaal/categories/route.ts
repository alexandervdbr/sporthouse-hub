import { requireGear, dbErrorResponse, optionalText, saveOrder } from '@/lib/gear/server'

// Categorieën van de materiaalplanner. Alleen voor wie de catalogus beheert.

export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const name = optionalText(body.name)
  if (!name) return new Response('Geef de categorie een naam.', { status: 400 })

  const { data: last } = await supabase
    .from('gear_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('gear_categories')
    .insert({ name, color: optionalText(body.color) ?? '#3A913F', sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id, name, color, sort_order')
    .single()
  if (error) return dbErrorResponse(error)
  return Response.json(data, { status: 201 })
}

// { order: [id, …] } na slepen, of { id, name?, color? }.
export async function PATCH(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  if ('order' in body) return saveOrder(supabase, 'gear_categories', body.order)

  if (typeof body.id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const update: Record<string, string> = {}
  const name = optionalText(body.name)
  const color = optionalText(body.color)
  if (name) update.name = name
  if (color) update.color = color

  const { data, error } = await supabase
    .from('gear_categories').update(update).eq('id', body.id).select('id, name, color, sort_order').single()
  if (error) return dbErrorResponse(error)
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })

  const { error } = await supabase.from('gear_categories').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return new Response('Er zit nog materiaal in deze categorie. Verplaats of verwijder dat eerst.', { status: 409 })
    }
    return dbErrorResponse(error)
  }
  return new Response(null, { status: 204 })
}
