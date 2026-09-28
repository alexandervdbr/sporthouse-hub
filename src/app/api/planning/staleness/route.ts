// Admin-only nudge: per (department, employee), wanneer was hun laatste
// planning_entries-rij? Gebruikt om in de configuratie-modal te laten zien
// wie er allang niet meer ingepland is — zonder dat iemand dat handmatig
// moet gaan opzoeken. Geen aparte tabel/kolom nodig, gewoon on-demand
// berekend uit de bestaande rijen.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_entries')
    .select('department, employee, year, month, day')

  if (error) return new Response(error.message, { status: 500 })

  const lastSeen = new Map<string, number>()
  for (const r of data ?? []) {
    const key = `${r.department}|${r.employee}`
    const t = Date.UTC(r.year, r.month - 1, r.day)
    const prev = lastSeen.get(key)
    if (prev === undefined || t > prev) lastSeen.set(key, t)
  }

  const result = Array.from(lastSeen.entries()).map(([key, t]) => {
    const [dept, emp] = key.split('|')
    return { dept, emp, lastEntryDate: new Date(t).toISOString().slice(0, 10) }
  })

  return Response.json(result)
}
