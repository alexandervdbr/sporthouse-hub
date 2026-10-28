import { createAdminClient } from '@/lib/supabase/server'
import {
  requireAdmin, loadRoles, listAllUsers, syncUsersWithRole, buildAppMetadata, locksOutCaller,
} from '@/lib/access-roles-server'
import { ACCESS_MODULES, levelOf, type AccessLevels } from '@/lib/access-roles'

// PATCH — naam, kleur en/of niveaus van een rol. Iedereen met deze rol krijgt
// meteen de nieuwe rechten; het antwoord zegt hoeveel accounts dat waren.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const { label, color, levels } = await req.json()

  const admin = createAdminClient()
  const roles = await loadRoles(admin)
  const role = roles.find(r => r.id === id)
  if (!role) return new Response('Rol niet gevonden', { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof label === 'string' && label.trim()) patch.label = label.trim()
  if (typeof color === 'string' && color) patch.color = color
  if (levels && typeof levels === 'object') {
    // Alleen bekende onderdelen met een bestaand niveau gaan de database in.
    const clean: AccessLevels = {}
    for (const m of ACCESS_MODULES) clean[m.key] = levelOf(levels as AccessLevels, m)
    patch.levels = clean
  }

  const nextRoles = roles.map(r => (r.id === id ? { ...r, ...patch } : r)) as typeof roles

  if (caller.app_metadata?.role === id) {
    const meta = buildAppMetadata(caller.app_metadata, {}, nextRoles)
    if (locksOutCaller(caller, caller.id, meta)) {
      return new Response('Je hebt zelf deze rol — zonder Beheer zou je jezelf buitensluiten', { status: 400 })
    }
  }

  const { error } = await admin.from('access_roles').update(patch).eq('id', id)
  if (error) return new Response(error.message, { status: 500 })

  try {
    const updated = await syncUsersWithRole(admin, id, nextRoles)
    return Response.json({ updated })
  } catch (e) {
    return new Response(`Rol opgeslagen, maar niet iedereen is bijgewerkt: ${(e as Error).message}`, { status: 500 })
  }
}

// DELETE — alleen een rol die niemand meer heeft
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const admin = createAdminClient()
  const users = await listAllUsers(admin)
  const inUse = users.filter(u => u.app_metadata?.role === id).length
  if (inUse > 0) {
    return new Response(`${inUse} ${inUse === 1 ? 'persoon heeft' : 'mensen hebben'} deze rol nog — geef ze eerst een andere`, { status: 409 })
  }

  const { error } = await admin.from('access_roles').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
