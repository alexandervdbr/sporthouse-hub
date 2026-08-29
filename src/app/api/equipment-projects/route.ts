import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

// Vaste projecten voor materiaalreservaties (FoS, De Spor, …). Iedereen mag ze
// lezen om te kunnen reserveren; enkel beheerders mogen de lijst aanpassen.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const isAdmin = isAdminUser(user)
  return isAdmin ? user : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('equipment_projects')
    .select('*')
    .order('sort_order')
    .order('name')

  // Tabel bestaat nog niet (migratie niet uitgevoerd): geen projecten, geen fout.
  if (error) return Response.json([])
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { name, color, show_in_planner } = await req.json()
  if (!name?.trim()) return new Response('Naam is verplicht', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('equipment_projects')
    .insert({
      name: name.trim(),
      color: color?.trim() || '#3A913F',
      show_in_planner: show_in_planner !== false,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id, ...fields } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof fields.name === 'string' && fields.name.trim()) update.name = fields.name.trim()
  if (typeof fields.color === 'string') update.color = fields.color
  if (typeof fields.show_in_planner === 'boolean') update.show_in_planner = fields.show_in_planner
  if (typeof fields.sort_order === 'number') update.sort_order = fields.sort_order

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('equipment_projects')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  // Bestaande reservaties houden hun projectnaam als vrije tekst; die raken we
  // niet aan, ze verliezen enkel hun kleur in het raster.
  const admin = createAdminClient()
  const { error } = await admin.from('equipment_projects').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
