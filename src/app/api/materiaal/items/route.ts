import { requireGear, dbErrorResponse, optionalText, responsibleFields, saveOrder } from '@/lib/gear/server'
import { planNumbering } from '@/lib/gear/naming'

// Items: elk fysiek voorwerp. Alleen voor wie de catalogus beheert. De status
// wijzig je via /items/[id]/status, zodat alles in het logboek komt; in een
// kit zetten via /kits/[id]/members, zodat de geschiedenis klopt.

const COLUMNS = 'id, category_id, name, model, number, serial_number, sort_order, label_color, nd_size, warning, notes, status, status_note, responsible_client_id, responsible_user_id, responsible_name'

function countOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}

// Drie vormen:
// - { category_id, model, count }       → "Model #n" … genummerd per model
// - { category_id, names: [...] }       → een lijst losse namen
// - { category_id, name, …specs }       → één item
export async function POST(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  const categoryId = optionalText(body.category_id)
  if (!categoryId) return new Response('Kies een categorie.', { status: 400 })

  const { data: last } = await supabase
    .from('gear_items').select('sort_order').eq('category_id', categoryId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const start = (last?.sort_order ?? 0) + 1

  type Row = { name: string; model: string | null; number: string | null }
  let rows: Row[]
  const model = optionalText(body.model)
  if (model && 'count' in body) {
    const count = countOf(body.count)
    if (!count) return new Response('Het aantal is minstens 1 (en hooguit 50).', { status: 400 })
    const { data: existing, error } = await supabase.from('gear_items').select('id, name').ilike('name', `${model.replace(/[%_]/g, '\\$&')}%`)
    if (error) return dbErrorResponse(error)
    const plan = planNumbering(model, (existing ?? []).map(e => e.name), count)
    if (plan.renameUnnumbered) {
      const bare = (existing ?? []).find(e => e.name.trim().toLowerCase() === model.toLowerCase())!
      const { error: renameError } = await supabase.from('gear_items')
        .update({ name: `${model} #1`, number: '#1', model }).eq('id', bare.id)
      if (renameError) return dbErrorResponse(renameError)
    }
    rows = plan.names.map(n => ({ name: n.name, model, number: n.number }))
  } else {
    const names: string[] = (Array.isArray(body.names) ? body.names : [body.name])
      .map(optionalText).filter((n: string | null): n is string => !!n)
    if (!names.length) return new Response('Geef minstens één naam.', { status: 400 })
    rows = names.map(name => ({ name, model: names.length === 1 ? model : null, number: null }))
  }

  const single = rows.length === 1
  const insert = rows.map((r, i) => ({
    ...r,
    category_id: categoryId,
    sort_order: start + i,
    serial_number: single ? optionalText(body.serial_number) : null,
    label_color: single ? optionalText(body.label_color) : null,
    nd_size: single ? optionalText(body.nd_size) : null,
    warning: optionalText(body.warning),
    notes: single ? optionalText(body.notes) : null,
  }))

  const { data, error } = await supabase.from('gear_items').insert(insert).select(COLUMNS)
  if (error) return dbErrorResponse(error)
  return Response.json(data ?? [], { status: 201 })
}

// { order: [id, …] } na slepen, of { id, … } met de velden die veranderen.
export async function PATCH(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await req.json()
  if ('order' in body) return saveOrder(supabase, 'gear_items', body.order)

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
  for (const key of ['model', 'number', 'serial_number', 'label_color', 'nd_size', 'warning', 'notes'] as const) {
    if (key in body) update[key] = optionalText(body[key])
  }
  const resp = responsibleFields(body)
  if (resp && 'error' in resp) return new Response(resp.error, { status: 400 })
  if (resp) Object.assign(update, resp.fields)

  const { data, error } = await supabase.from('gear_items').update(update).eq('id', body.id).select(COLUMNS).single()
  if (error) return dbErrorResponse(error)
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const auth = await requireGear('manageCatalog')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await req.json()
  if (typeof id !== 'string') return new Response('ID ontbreekt', { status: 400 })
  const { error } = await supabase.from('gear_items').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return new Response('Dit materiaal heeft boekingen en blijft daarom bewaard. Zet het op "uit dienst" als het niet meer gebruikt wordt.', { status: 409 })
    }
    return dbErrorResponse(error)
  }
  return new Response(null, { status: 204 })
}
