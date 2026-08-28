import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const { name, description, category, color } = await req.json()

  const updates: Record<string, string | null> = {}
  if (name !== undefined) updates.name = name.trim().toLowerCase().replace(/\s+/g, '-')
  if (description !== undefined) updates.description = description?.trim() || null
  if (category !== undefined) updates.category = category?.trim() || 'Algemeen'
  if (color !== undefined) updates.color = color || null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chat_channels')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('chat_channels').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
