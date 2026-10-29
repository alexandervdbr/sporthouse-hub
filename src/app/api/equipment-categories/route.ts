import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canManageEquipment } from '@/lib/equipment-access'

// Categorieën van de materiaalplanning (de kolomgroepen in het raster).
// Iedereen leest ze; wie de planning beheert, past ze aan.
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
    .from('equipment_categories')
    .select('*')
    .order('sort_order')
    .order('name')

  // Tabel bestaat nog niet (migratie 0068 niet uitgevoerd): de planner valt
  // dan terug op de categorieën die op het materiaal zelf staan.
  if (error) return Response.json([])
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const { name, color } = await req.json()
  if (!name?.trim()) return new Response('Naam is verplicht', { status: 400 })

  const admin = createAdminClient()
  // Nieuwe categorie achteraan.
  const { data: last } = await admin
    .from('equipment_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('equipment_categories')
    .insert({ name: name.trim(), color: color?.trim() || '#3A913F', sort_order: (last?.sort_order ?? 0) + 1 })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een categorie met die naam.', { status: 409 })
    return new Response(error.message, { status: 500 })
  }
  return Response.json(data, { status: 201 })
}

// Twee vormen: { order: [id, …] } zet de volgorde na slepen, of
// { id, name?, color? } past één categorie aan.
export async function PATCH(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  if (Array.isArray(body.order)) {
    const results = await Promise.all(
      (body.order as string[]).map((id, i) =>
        admin.from('equipment_categories').update({ sort_order: i + 1 }).eq('id', id))
    )
    const failed = results.find(r => r.error)
    if (failed?.error) return new Response(failed.error.message, { status: 500 })
    return new Response(null, { status: 204 })
  }

  const { id, name, color } = body
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const { data: current } = await admin.from('equipment_categories').select('name').eq('id', id).maybeSingle()
  if (!current) return new Response('Niet gevonden', { status: 404 })

  const update: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) update.name = name.trim()
  if (typeof color === 'string' && color.trim()) update.color = color.trim()

  const { data, error } = await admin.from('equipment_categories').update(update).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een categorie met die naam.', { status: 409 })
    return new Response(error.message, { status: 500 })
  }

  // Materiaal hangt op naam aan zijn categorie: bij hernoemen gaat het mee.
  if (update.name && update.name !== current.name) {
    const { error: moveError } = await admin
      .from('equipment')
      .update({ category: update.name })
      .eq('category', current.name)
    if (moveError) return new Response(moveError.message, { status: 500 })
  }

  return Response.json(data)
}

export async function DELETE(req: Request) {
  if (!await requireManager()) return new Response('Forbidden', { status: 403 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const admin = createAdminClient()
  const { data: cat } = await admin.from('equipment_categories').select('name').eq('id', id).maybeSingle()
  if (!cat) return new Response('Niet gevonden', { status: 404 })

  // Alleen lege categorieën: anders verdwijnt materiaal uit het raster.
  const { count } = await admin
    .from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('category', cat.name)
  if (count) {
    return new Response(`Er zit nog ${count} stuk${count === 1 ? '' : 's'} materiaal in "${cat.name}". Verplaats of verwijder dat eerst.`, { status: 409 })
  }

  const { error } = await admin.from('equipment_categories').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
