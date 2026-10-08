// Admin-only nudge: per (department, employee), wanneer was hun laatste
// planning_entries-rij, en hoeveel staan er? Gebruikt om in de
// configuratie-modal te laten zien wie er allang niet meer ingepland is —
// zonder dat iemand dat handmatig moet gaan opzoeken. Geen aparte tabel/kolom
// nodig, gewoon on-demand berekend uit de bestaande rijen.
//
// De telling komt er gratis bij, want deze route loopt de tabel toch al af.
//
// Let op bij het verbruik: dit leest élke rij van planning_entries, en groeit
// dus mee. Vandaag is dat niets, met een jaar planning voor 32 mensen zo'n
// 8.000 rijen — ruw een halve MB, ingepakt rond de 50 kB. Dat is te doen
// omdat het beheer-only is en alleen draait wanneer iemand de
// configuratiemodal opent, niet op een timer. Zou dat veranderen, of loopt
// de tabel in de tienduizenden, maak er dan een aggregaat van (RPC met een
// group by) in plaats van alles op te halen om te tellen.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { fetchAllRows } from '@/lib/planning-paginate'

interface StalenessRow {
  contact_id: string
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
        .select('contact_id, year, month, day')
        .order('id', { ascending: true })
    )
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Ophalen mislukt', { status: 500 })
  }

  const lastSeen = new Map<string, number>()
  const counts = new Map<string, number>()
  for (const r of data) {
    const t = Date.UTC(r.year, r.month - 1, r.day)
    const prev = lastSeen.get(r.contact_id)
    if (prev === undefined || t > prev) lastSeen.set(r.contact_id, t)
    counts.set(r.contact_id, (counts.get(r.contact_id) ?? 0) + 1)
  }

  const result = Array.from(lastSeen.entries()).map(([contactId, t]) => ({
    contactId,
    lastEntryDate: new Date(t).toISOString().slice(0, 10),
    entryCount: counts.get(contactId) ?? 0,
  }))

  return Response.json(result)
}
