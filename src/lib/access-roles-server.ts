import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { type AccessRole, buildAppMetadata } from '@/lib/access-roles'

export { buildAppMetadata, locksOutCaller } from '@/lib/access-roles'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

export async function loadRoles(admin: SupabaseClient): Promise<AccessRole[]> {
  const { data, error } = await admin
    .from('access_roles')
    .select('id, label, color, levels, sort_order')
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as AccessRole[]
}

export async function listAllUsers(admin: SupabaseClient) {
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  return users
}

// Na het wijzigen van een rol krijgt iedereen met die rol de nieuwe
// sleutellijst. Eén update per persoon; het gaat om een handvol accounts.
export async function syncUsersWithRole(admin: SupabaseClient, roleId: string, roles: AccessRole[]) {
  const users = await listAllUsers(admin)
  const affected = users.filter(u => u.app_metadata?.role === roleId)
  for (const u of affected) {
    const meta = buildAppMetadata(u.app_metadata, {}, roles)
    const { error } = await admin.auth.admin.updateUserById(u.id, { app_metadata: meta })
    if (error) throw new Error(`${u.email}: ${error.message}`)
  }
  return affected.length
}
