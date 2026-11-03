import { requireGear, dbErrorResponse, optionalText, saveOrder } from '@/lib/gear/server'

// Units (wat geboekt wordt). Alleen voor wie de catalogus beheert. De status
// wijzig je niet hier maar via /units/[id]/status, zodat ook melders zonder
// beheerrechten dat kunnen en alles in het logboek komt.

const UNIT_COLUMNS = 'id, category_id, name, quantity, sort_order, label_color, nd_size, warning, notes, status, status_note, home_client_id'

function quantityOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 ? n : null
}

// Eén unit ({ name, … }) of een lijst namen in één keer ({ names: [...] }).
export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const categoryId = optionalText(body.category_id)
  if (!categoryId) return new Response('Kies een categorie.', { status: 400 })

  const names: string[] = (Array.isArray(body.names) ? body.names : [body.name])
    .map(optionalText).filter((n: string | null): n is string => !!n)
  if (!names.length) return new Response('Geef minstens één naam.', { status: 400 })

  const { data: last } = await supabase
    .from('gear_units').select('sort_order').eq('category_id', categoryId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const start = (last?.sort_order ?? 0) + 1

  const single = names.length === 1
  const rows = names.map((name, i) => ({
    category_id: categoryId,
    name,
    sort_order: start + i,
    quantity: single ? (quantityOf(body.quantity) ?? 1) : 1,
    label_color: single ? optionalText(body.label_color) : null,
    nd_size:     single ? optionalText(body.nd_size) : null,
    warning:     single ? optionalText(body.warning) : null,
    notes:       single ? optionalText(body.notes) : null,
  }))

  const { data, error } = await supabase.from('gear_units').insert(rows).select(UNIT_COLUMNS)
  if (error) return dbErrorResponse(error)
  return Response.json((data ?? []).map(u => ({ ...u, contents: [] })), { status: 201 })
}

// { order: [id, …] } na slepen binnen een categorie, of { id, … } met de
// velden die veranderen.
export async function PATCH(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  if ('order' in body) return saveOrder(supabase, 'gear_units', body.order)

  if (typeof body.id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const update: Record<string, unknown> = {}
  if ('name' in body) {
    const name = optionalText(body.name)
    if (!name) return new Response('De naam mag niet leeg zijn.', { status: 400 })
    update.name = name
  }
  if ('category_id' in body) {
    const cat = optionalText(body.category_id)
    if (!cat) return new Response('Kies een categorie.', { status: 400 })
    update.category_id = cat
  }
  if ('quantity' in body) {
    const q = quantityOf(body.quantity)
    if (!q) return new Response('Het aantal is minstens 1.', { status: 400 })
    update.quantity = q
  }
  for (const key of ['label_color', 'nd_size', 'warning', 'notes', 'home_client_id'] as const) {
    if (key in body) update[key] = optionalText(body[key])
  }

  const { data, error } = await supabase.from('gear_units').update(update).eq('id', body.id).select(UNIT_COLUMNS).single()
  if (error) return dbErrorResponse(error)
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })

  const { error } = await supabase.from('gear_units').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return new Response('Dit materiaal heeft boekingen en blijft daarom bewaard. Zet het op "uit dienst" als het niet meer gebruikt wordt.', { status: 409 })
    }
    return dbErrorResponse(error)
  }
  return new Response(null, { status: 204 })
}
