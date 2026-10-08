// De planning achter een persoonlijke link. Geen login — het token is de
// sleutel, zie supabase/migrations/0052_planning_links.sql.
//
// Elke aanroep lost het token opnieuw op en leidt daaruit af om wiens rij het
// gaat. De aanroeper zegt nooit zelf wie hij is: er komt geen afdeling of naam
// uit de body, alleen een datum en een waarde. Daarmee kan deze route per
// constructie niets aanraken buiten die ene persoon.

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

// Eén dag zetten of wissen. Bewust één dag per aanroep: dit scherm is voor
// iemand die zijn eigen rooster bijwerkt, niet voor bulkbewerking, en dan is
// een simpele route die weinig kan het juiste antwoord.
export async function PUT(req: Request) {
  let body: {
    token?: unknown; year?: unknown; month?: unknown; day?: unknown
    value?: unknown; note?: unknown; bgColor?: unknown; textColor?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const link = await resolvePlanningLink(body.token)
  if (!link) return new Response('Niet gevonden', { status: 404 })

  const year = Number(body.year)
  const month = Number(body.month)
  const day = Number(body.day)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return new Response('Ongeldig jaar', { status: 400 })
  if (!Number.isInteger(month) || month < 1 || month > 12) return new Response('Ongeldige maand', { status: 400 })
  if (!Number.isInteger(day) || day < 1 || day > 31) return new Response('Ongeldige dag', { status: 400 })

  const admin = createAdminClient()
  const where = {
    year, month, day,
    department: link.department,
    employee: link.employee,
  }

  const value = typeof body.value === 'string' ? body.value.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''

  // Grenzen op wat er binnenkomt. Deze route heeft geen login erachter, dus
  // het enige wat tussen een bezoeker en de tabel staat is wat hier
  // gecontroleerd wordt. Een status is een label van een paar tekens en een
  // notitie een halve zin; alles daarboven is geen vergissing.
  if (value.length > 100) return new Response('Status is te lang', { status: 400 })
  if (note.length > 500) return new Response('Notitie is te lang', { status: 400 })

  // Lege waarde betekent wissen. Hetzelfde gebaar als in de app zelf: een cel
  // leegmaken is hem verwijderen, niet hem op een lege tekst zetten.
  if (!value) {
    const { error } = await admin.from('planning_entries').delete().match(where)
    if (error) return new Response(error.message, { status: 500 })
    touchPlanningLink(link.token)
    return new Response(null, { status: 204 })
  }

  const { error } = await admin.from('planning_entries').upsert({
    ...where,
    value: value.toUpperCase(),
    bold: true,
    text_color: typeof body.textColor === 'string' ? body.textColor : '#ffffff',
    bg_color: typeof body.bgColor === 'string' ? body.bgColor : null,
    note: note || null,
    // Wie het was staat vast door de link, niet door wat de browser beweert.
    updated_by: `link:${link.employee}`,
    // updated_at wordt door de database gezet, zie migratie 0050.
  }, { onConflict: 'year,month,day,department,employee' })

  if (error) return new Response(error.message, { status: 500 })
  touchPlanningLink(link.token)
  return new Response(null, { status: 204 })
}
