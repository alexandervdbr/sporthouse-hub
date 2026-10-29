import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canManageEquipment } from '@/lib/equipment-access'

// Lezen mag iedereen die ingelogd is; al de rest (toevoegen, aanpassen,
// volgorde, defect, verwijderen) is voor wie de materiaalplanning beheert.
async function requireManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return canManageEquipment(user) ? user : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('category')
    .order('sort_order')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

// Eén stuk ({ name, category, description }) of een hele lijst in één keer
// ({ names: [...], category }) — dat laatste om de lijst snel opnieuw in te
// geven.
export async function POST(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const { name, names, category, description, owner } = await req.json()
  const list: string[] = (Array.isArray(names) ? names : [name])
    .map((n: unknown) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
  if (!list.length || !category?.trim()) {
    return new Response('Naam en categorie zijn verplicht', { status: 400 })
  }

  const admin = createAdminClient()
  // Nieuw materiaal komt achteraan in zijn categorie.
  const { data: last } = await admin
    .from('equipment')
    .select('sort_order')
    .eq('category', category.trim())
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const start = (last?.sort_order ?? 0) + 1

  const rows = list.map((n, i) => ({
    name: n,
    category: category.trim(),
    description: list.length === 1 ? (description?.trim() || null) : null,
    owner: owner?.trim() || null,
    sort_order: start + i,
  }))

  const { data, error } = await admin.from('equipment').insert(rows).select()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('equipment').delete().eq('id', id)
  if (error) {
    // 23503 = foreign_key_violation — this item still has reservation
    // history, which we deliberately don't cascade away (unlike a client
    // delete, there's no promise anywhere that this wipes history).
    if (error.code === '23503') {
      return new Response('Dit materiaal heeft nog reservaties en kan niet verwijderd worden. Verwijder eerst de bijbehorende reservaties, of meld het als defect zodat het uit het raster verdwijnt.', { status: 409 })
    }
    return new Response(error.message, { status: 500 })
  }
  return new Response(null, { status: 204 })
}

// Twee vormen: { order: [id, …], category } zet de volgorde (en categorie)
// na slepen, of { id, … } past één stuk aan: naam, categorie, inhoud,
// verantwoordelijke, defect.
export async function PATCH(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  if (Array.isArray(body.order)) {
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
    const results = await Promise.all(
      (body.order as string[]).map((id, i) =>
        admin.from('equipment')
          .update(category ? { sort_order: i + 1, category } : { sort_order: i + 1 })
          .eq('id', id))
    )
    const failed = results.find(r => r.error)
    if (failed?.error) return new Response(failed.error.message, { status: 500 })
    return new Response(null, { status: 204 })
  }

  const { id, is_broken, broken_note, name, category, description, owner, owner_note } = body
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof is_broken === 'boolean') {
    update.is_broken = is_broken
    // Bij herstel verdwijnt ook de reden, anders blijft die rondslingeren.
    update.broken_note = is_broken ? (broken_note?.trim() || null) : null
  } else if (typeof broken_note === 'string') {
    update.broken_note = broken_note.trim() || null
  }
  if (typeof name === 'string' && name.trim()) update.name = name.trim()
  if (typeof category === 'string' && category.trim()) update.category = category.trim()
  if (typeof description === 'string') update.description = description.trim() || null
  if (typeof owner === 'string') update.owner = owner.trim() || null
  if (typeof owner_note === 'string') update.owner_note = owner_note.trim() || null

  const { data, error } = await admin.from('equipment').update(update).eq('id', id).select().single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
