import { createClient } from '@/lib/supabase/server'
import { hasSection } from '@/lib/auth-permissions'
import { fetchAllRows } from '@/lib/planning-paginate'

// GET — per-employee, per-status day counts for a given year (optionally
// narrowed to one month) — the aggregation behind the Statistieken tab.
// Gated on the planning_statistieken permission (or beheer) at the route
// level too, mirroring the rest of this app's convention, even though
// planning_entries itself is already readable by any authenticated user
// (see the RLS note in 0024_client_scoped_rls_policies.sql) — this is about
// which UI users see the tab, same intent as the permission itself.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!hasSection(user, 'planning_statistieken')) return new Response('Forbidden', { status: 403 })

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const monthParam = searchParams.get('month')
  const month = monthParam ? Number(monthParam) : null
  if (!year) return new Response('Missing year', { status: 400 })

  // Gepagineerd, niet in één vraag: een jaar zit ver boven de duizend rijen
  // die Supabase standaard teruggeeft, en een drukke maand ook. Zonder dit
  // telde deze tabel een willekeurig deel van de planning en zag dat er net
  // zo geloofwaardig uit. Zie src/lib/planning-paginate.ts.
  let data: { employee: string; value: string }[]
  try {
    data = await fetchAllRows<{ employee: string; value: string }>(() => {
      let query = supabase.from('planning_entries').select('employee, value').eq('year', year)
      if (month) query = query.eq('month', month)
      return query.order('id', { ascending: true })
    })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Ophalen mislukt', { status: 500 })
  }

  const counts = new Map<string, Map<string, number>>()
  for (const row of data) {
    const byValue = counts.get(row.employee) ?? new Map<string, number>()
    byValue.set(row.value, (byValue.get(row.value) ?? 0) + 1)
    counts.set(row.employee, byValue)
  }

  const result: { employee: string; value: string; count: number }[] = []
  for (const [employee, byValue] of counts) {
    for (const [value, count] of byValue) result.push({ employee, value, count })
  }

  return Response.json(result)
}
