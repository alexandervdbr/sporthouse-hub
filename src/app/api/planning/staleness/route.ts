// Admin-only nudge: per (department, employee), wanneer was hun laatste
// planning_entries-rij, en hoeveel staan er? Gebruikt om in de
// configuratie-modal te laten zien wie er allang niet meer ingepland is —
// zonder dat iemand dat handmatig moet gaan opzoeken. Geen aparte tabel/kolom
// nodig, gewoon on-demand berekend uit de bestaande rijen.
//
// De telling komt er gratis bij, want deze route loopt de tabel toch al af.
// Ze wordt gebruikt om verwijderen te blokkeren voor iemand die planning
// heeft staan: die rijen staan op (afdeling, naam) en raken dus los zodra de
// naam uit het rooster verdwijnt.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { fetchAllRows } from '@/lib/planning-paginate'

interface StalenessRow {
  department: string
  employee: string
  year: number
  month: number
  day: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()

  // Dit leest de hele tabel, dus de duizend-rijen-grens bijt hier het hardst:
  // ongepagineerd kwam er een willekeurig deel terug en wees de "60 dagen niet
  // ingepland"-waarschuwing dus naar willekeurige mensen. Zie
  // src/lib/planning-paginate.ts.
  let data: StalenessRow[]
  try {
    data = await fetchAllRows<StalenessRow>(() =>
      admin
        .from('planning_entries')
        .select('department, employee, year, month, day')
        .order('id', { ascending: true })
    )
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Ophalen mislukt', { status: 500 })
  }

  const lastSeen = new Map<string, number>()
  const counts = new Map<string, number>()
  for (const r of data) {
    const key = `${r.department}|${r.employee}`
    const t = Date.UTC(r.year, r.month - 1, r.day)
    const prev = lastSeen.get(key)
    if (prev === undefined || t > prev) lastSeen.set(key, t)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const result = Array.from(lastSeen.entries()).map(([key, t]) => {
    const i = key.indexOf('|')
    return {
      dept: key.slice(0, i),
      emp: key.slice(i + 1),
      lastEntryDate: new Date(t).toISOString().slice(0, 10),
      entryCount: counts.get(key) ?? 0,
    }
  })

  return Response.json(result)
}
