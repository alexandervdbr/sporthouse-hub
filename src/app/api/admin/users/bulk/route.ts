import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, loadRoles, buildAppMetadata, locksOutCaller } from '@/lib/access-roles-server'

// POST — meerdere mensen tegelijk een rol geven. Hun persoonlijke afwijkingen
// blijven staan, voor zover ze nog afwijken van de nieuwe rol.
export async function POST(req: Request) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { ids, access_role } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) return new Response('Kies minstens één persoon', { status: 400 })

  const admin = createAdminClient()
  const roles = await loadRoles(admin)
  if (!roles.some(r => r.id === access_role)) return new Response('Onbekende rol', { status: 400 })

  let updated = 0
  for (const id of ids as string[]) {
    const { data: { user } } = await admin.auth.admin.getUserById(id)
    if (!user) continue
    const meta = buildAppMetadata(user.app_metadata, { access_role }, roles)
    if (locksOutCaller(caller, id, meta)) {
      return new Response(`Na ${updated} aanpassing(en) gestopt: zonder Beheer zou je jezelf buitensluiten`, { status: 400 })
    }
    const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: meta })
    if (error) return new Response(`${user.email}: ${error.message}`, { status: 500 })
    updated++
  }
  return Response.json({ updated })
}
