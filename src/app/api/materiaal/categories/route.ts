import { requireGear, dbErrorResponse, optionalText, saveOrder } from '@/lib/gear/server'

// Categorieën van de materiaalplanner. Alleen voor wie de catalogus beheert.
// Verwijderen en terugzetten lopen via gear_delete_category en
// gear_restore_category (0077): alles in één transactie.

export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  // { restore: momentopname }: een verwijderde categorie terugzetten.
  if (body.restore) {
    const { data, error } = await supabase.rpc('gear_restore_category', { p_snapshot: body.restore })
    if (error) return dbErrorResponse(error)
    return Response.json(data)
  }
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
  // De volgorde van de categorieën: alleen platformbeheerders (admin), niet het niveau Beheren.
  if ('order' in body) {
    if (!auth.access.reorderCategories) return new Response('Alleen een beheerder van het platform kan de categorieën herschikken.', { status: 403 })
    return saveOrder(supabase, 'gear_categories', body.order)
  }

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

// { id, into? }: de inhoud gaat naar `into` (verplicht als er iets in zit),
// daarna is de categorie weg. Geeft de momentopname terug voor "Ongedaan maken".
export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id, into } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  if (into !== undefined && into !== null && typeof into !== 'string') return new Response('Ongeldige categorie', { status: 400 })

  const { data, error } = await supabase.rpc('gear_delete_category', { p_category_id: id, p_into_id: into ?? null })
  if (error) return dbErrorResponse(error)
  return Response.json(data)
}
