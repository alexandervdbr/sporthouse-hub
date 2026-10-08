// De planning achter een persoonlijke link. Geen login — het token is de
// sleutel, zie supabase/migrations/0052_planning_links.sql.
//
// Elke aanroep lost het token opnieuw op en leidt daaruit af om wiens rij het
// gaat. De aanroeper zegt nooit zelf wie hij is.
//
// Alleen lezen. Er was een PUT om één dag te zetten, maar het scherm erachter
// is alleen-lezen geworden (zie MyPlanningLink) en een publiek schrijfpad dat
// niemand gebruikt is alleen maar oppervlak. Komt bewerken terug, dan komt
// deze route mee terug.

import { createAdminClient } from '@/lib/supabase/server'
import { resolvePlanningLink, touchPlanningLink } from '@/lib/planning-links'
import { fetchAllRows } from '@/lib/planning-paginate'
import { SELECT_COLS, type PlanningRow } from '@/lib/planning-cache'

function monthFromQuery(url: URL): { year: number; month: number } | null {
  const year = Number(url.searchParams.get('year'))
  const month = Number(url.searchParams.get('month'))
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const link = await resolvePlanningLink(url.searchParams.get('token'))
  if (!link) return new Response('Niet gevonden', { status: 404 })

  const period = monthFromQuery(url)
  if (!period) return new Response('Ongeldige maand', { status: 400 })

  const admin = createAdminClient()
  let rows: PlanningRow[]
  try {
    rows = await fetchAllRows<PlanningRow>(() =>
      admin
        .from('planning_entries')
        .select(SELECT_COLS)
        .eq('year', period.year)
        .eq('month', period.month)
        .eq('department', link.department)
        .eq('employee', link.employee)
        .order('id', { ascending: true })
    )
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Ophalen mislukt', { status: 500 })
  }

  touchPlanningLink(link.token)

  return Response.json({
    name: link.employee,
    department: link.department,
    rows,
  })
}
