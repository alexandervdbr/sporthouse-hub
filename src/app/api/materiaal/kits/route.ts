import { requireGear, dbErrorResponse, optionalText, responsibleFields, saveOrder } from '@/lib/gear/server'

// Kits aanmaken en aanpassen (naam, categorie, labelkleur, waarschuwing,
// notitie, verantwoordelijke, volgorde). Onderdelen gaan via
// /kits/[id]/members, opheffen via /kits/[id]/dissolve.

const COLUMNS = 'id, category_id, name, label_color, warning, notes, sort_order, responsible_client_id, responsible_user_id, responsible_name'

function kitFields(body: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const update: Record<string, unknown> = {}
  if ('name' in body) {
    const name = optionalText(body.name)
    if (!name) return { error: 'Geef de kit een naam.' }
    update.name = name
  }
  if ('category_id' in body) {
    const cat = optionalText(body.category_id)
    if (!cat) return { error: 'Kies een categorie.' }
    update.category_id = cat
  }
  for (const key of ['label_color', 'warning', 'notes'] as const) {
    if (key in body) update[key] = optionalText(body[key])
  }
  const resp = responsibleFields(body)
  if (resp && 'error' in resp) return { error: resp.error }
  if (resp) Object.assign(update, resp.fields)
  return update
}

export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const fields = kitFields(body)
  if ('error' in fields) return new Response(String(fields.error), { status: 400 })
  if (!fields.name || !fields.category_id) return new Response('Geef de kit een naam en een categorie.', { status: 400 })

  const { data: last } = await supabase.from('gear_kits').select('sort_order').eq('category_id', fields.category_id as string)
    .is('dissolved_at', null).order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase.from('gear_kits')
    .insert({ ...fields, sort_order: (last?.sort_order ?? 0) + 1 }).select(COLUMNS).single()
  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een kit met die naam.', { status: 409 })
    return dbErrorResponse(error)
  }
  return Response.json({ ...data, item_ids: [] }, { status: 201 })
}

// { order: [id, …] } na slepen, of { id, … } met de velden die veranderen.
export async function PATCH(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  if ('order' in body) return saveOrder(supabase, 'gear_kits', body.order)
  if (typeof body.id !== 'string') return new Response('ID ontbreekt', { status: 400 })

  const fields = kitFields(body)
  if ('error' in fields) return new Response(String(fields.error), { status: 400 })
  const { data, error } = await supabase.from('gear_kits').update(fields).eq('id', body.id).is('dissolved_at', null)
    .select(COLUMNS).single()
  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een kit met die naam.', { status: 409 })
    return dbErrorResponse(error)
  }
  return Response.json(data)
}

// Echt verwijderen kan alleen een kit die nooit onderdelen had. Een kit met
// geschiedenis hef je op (/kits/[id]/dissolve).
export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const { error } = await supabase.from('gear_kits').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') return new Response('Deze kit heeft geschiedenis. Hef hem op in plaats van hem te verwijderen.', { status: 409 })
    return dbErrorResponse(error)
  }
  return new Response(null, { status: 204 })
}
