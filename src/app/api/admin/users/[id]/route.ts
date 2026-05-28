import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const ok = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  return ok ? user : null
}

// PATCH — update role and/or permissions
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { permissions, expires_at } = body

  const admin = createAdminClient()

  const { data: { user: existing } } = await admin.auth.admin.getUserById(id)
  const updated: Record<string, unknown> = { ...existing?.user_metadata }
  if (permissions !== undefined) updated.permissions = permissions
  if (expires_at !== undefined) updated.expires_at = expires_at || null
  updated.allowed = true  // always mark as approved when admin saves

  const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: updated })
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}

// DELETE — remove user
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params

  // Prevent self-deletion
  if (id === caller.id) return new Response('Je kan jezelf niet verwijderen', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
