import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, loadRoles, listAllUsers } from '@/lib/access-roles-server'
import { allLowest, slugifyRoleId, ROLE_COLORS } from '@/lib/access-roles'

// GET — alle rollen, met per rol hoeveel accounts hem hebben
export async function GET() {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const [roles, users] = await Promise.all([loadRoles(admin), listAllUsers(admin)])
  const counts = new Map<string, number>()
  for (const u of users) {
    const r = u.app_metadata?.role as string | undefined
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  return Response.json(roles.map(r => ({ ...r, user_count: counts.get(r.id) ?? 0 })))
}

// POST — nieuwe rol, leeg of als kopie van een bestaande
export async function POST(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const { label, color, copy_from } = await req.json()
  const name = String(label ?? '').trim()
  if (!name) return new Response('Geef de rol een naam', { status: 400 })
  const id = slugifyRoleId(name)
  if (!id) return new Response('Kies een naam met letters of cijfers', { status: 400 })

  const admin = createAdminClient()
  const roles = await loadRoles(admin)
  if (roles.some(r => r.id === id)) return new Response('Er bestaat al een rol met die naam', { status: 409 })

  const source = copy_from ? roles.find(r => r.id === copy_from) : null
  const row = {
    id,
    label: name,
    color: color || ROLE_COLORS[roles.length % ROLE_COLORS.length],
    levels: source?.levels ?? allLowest(),
    sort_order: Math.max(0, ...roles.map(r => r.sort_order)) + 10,
  }
  const { error } = await admin.from('access_roles').insert(row)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ...row, user_count: 0 })
}
