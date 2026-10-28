import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, loadRoles, buildAppMetadata, locksOutCaller } from '@/lib/access-roles-server'

// PATCH — rol, afwijkingen, klanten, planningkolom, wachtwoorden, vervaldatum.
// Elk veld is optioneel; wat ontbreekt blijft zoals het was.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { access_role, overrides, clients, planning_column, credentials, expires_at } = body

  const admin = createAdminClient()
  const roles = await loadRoles(admin)
  if (access_role && !roles.some(r => r.id === access_role)) {
    return new Response('Onbekende rol', { status: 400 })
  }

  const { data: { user: existing } } = await admin.auth.admin.getUserById(id)
  if (!existing) return new Response('Gebruiker niet gevonden', { status: 404 })
  const updated = buildAppMetadata(existing.app_metadata, { access_role, overrides, clients, planning_column, credentials }, roles)
  if (expires_at !== undefined) updated.expires_at = expires_at || null
  const finalRole = roles.find(r => r.id === updated.role)
  if (finalRole?.requires_end_date && !updated.expires_at) {
    return new Response(`Een ${finalRole.label.toLowerCase()} heeft een einddatum nodig`, { status: 400 })
  }
  if (locksOutCaller(caller, id, updated)) {
    return new Response('Zonder Beheer sluit je jezelf buiten — kies een rol met Beheer', { status: 400 })
  }

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
