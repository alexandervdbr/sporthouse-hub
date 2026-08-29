import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ok = isAdminUser(user)
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
  const updated: Record<string, unknown> = { ...existing?.app_metadata }
  if (permissions !== undefined) updated.permissions = permissions
  if (expires_at !== undefined) updated.expires_at = expires_at || null
  updated.allowed = true  // always mark as approved when admin saves

  const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: updated })
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

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  )
  if (!res.ok) return new Response(await res.text(), { status: res.status })
  return new Response(null, { status: 204 })
}
