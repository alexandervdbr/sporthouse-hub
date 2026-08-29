import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

const CATEGORIES = ['klant', 'atleet', 'podcast', 'intern']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

// PATCH — update a client's settings
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const { name, category, color, logo_url, description } = await req.json()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return new Response('Naam is verplicht.', { status: 400 })
    updates.name = name.trim()
  }
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) return new Response('Ongeldige categorie.', { status: 400 })
    updates.category = category
  }
  if (color !== undefined) updates.color = color?.trim() || '#3b82f6'
  if (logo_url !== undefined) updates.logo_url = logo_url?.trim() || null
  if (description !== undefined) updates.description = description?.trim() || null

  if (Object.keys(updates).length === 0) return new Response('Niets om op te slaan.', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('clients').update(updates).eq('id', id).select().single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

// DELETE — permanently remove a client. This cascades through 15+ tables
// (documents, files, meetings, chat history, favorites, ...) with no
// soft-delete or undo — the caller must echo the client's exact current
// name back as confirmName, enforced here server-side, not just in the UI,
// so this can't be triggered by a stray click or a scripted request.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const { confirmName } = await req.json().catch(() => ({ confirmName: undefined }))

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('name').eq('id', id).single()
  if (!client) return new Response('Klant niet gevonden.', { status: 404 })

  if (confirmName !== client.name) {
    return new Response('Bevestigingsnaam komt niet overeen.', { status: 400 })
  }

  const { error } = await admin.from('clients').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
