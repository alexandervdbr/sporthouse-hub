import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.app_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('category')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { name, category, description } = await req.json()
  if (!name?.trim() || !category?.trim()) {
    return new Response('Naam en categorie zijn verplicht', { status: 400 })
  }

  const { data, error } = await supabase
    .from('equipment')
    .insert({ name: name.trim(), category: category.trim(), description: description?.trim() || null })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const { error } = await supabase.from('equipment').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}

// Defect melden of terug in gebruik nemen. Alleen beheerders: een defect stuk
// verdwijnt uit het raster voor iedereen anders en is niet meer te reserveren.
export async function PATCH(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id, is_broken, broken_note, name, category, description } = await req.json()
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

  const admin = createAdminClient()
  const { data, error } = await admin.from('equipment').update(update).eq('id', id).select().single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
