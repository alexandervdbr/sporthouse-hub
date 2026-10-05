// Iemand hernoemen of naar een andere afdeling verplaatsen is een migratie,
// niet alleen een tekstwijziging.
//
// planning_entries is gesleuteld op de tékst (department, employee) — er is
// geen gedeeld id met de afdelingenconfig. Niets in de codebase werkte die
// kolommen ooit bij, dus een hernoeming in de configuratie liet alle bestaande
// cellen onder de oude naam achter: ze verdwenen uit het raster en bleven
// meetellen in Statistieken onder een naam die niemand nog ziet.
//
// Deze route doet de twee helften in één keer: eerst de rijen verhuizen, dan
// de nieuwe config wegschrijven. Die volgorde is bewust. Faalt de config,
// dan staan de rijen al onder de nieuwe naam en is die nog niet in het
// rooster — zichtbaar als "weg", maar niets is kwijt, en dezelfde actie
// opnieuw uitvoeren herstelt het: de verhuizing vindt dan nul rijen (klaar)
// en schrijft alleen de config nog weg.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Department } from '@/lib/planning-config'
import type { PlanningRename, RenameResult } from '@/lib/planning-rename'
import { isAdminUser } from '@/lib/auth-permissions'

function isRename(v: unknown): v is PlanningRename {
  const r = v as PlanningRename
  return !!r
    && typeof r.fromDept === 'string' && r.fromDept.trim() !== ''
    && typeof r.fromEmp === 'string' && r.fromEmp.trim() !== ''
    && typeof r.toDept === 'string' && r.toDept.trim() !== ''
    && typeof r.toEmp === 'string' && r.toEmp.trim() !== ''
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  let body: { renames?: unknown; departments?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const renames = Array.isArray(body.renames) ? body.renames.filter(isRename) : []
  if (Array.isArray(body.renames) && renames.length !== body.renames.length) {
    return new Response('Elke hernoeming heeft fromDept, fromEmp, toDept en toEmp nodig', { status: 400 })
  }

  const departments = body.departments
  if (!Array.isArray(departments) || departments.length === 0) {
    return new Response('Een leeg rooster wordt niet opgeslagen', { status: 400 })
  }

  const admin = createAdminClient()
  const results: RenameResult[] = []

  for (const r of renames) {
    const from = { dept: r.fromDept.trim(), emp: r.fromEmp.trim() }
    const to = { dept: r.toDept.trim(), emp: r.toEmp.trim() }

    if (from.dept === to.dept && from.emp === to.emp) {
      results.push({ ...r, ok: true, moved: 0 })
      continue
    }

    const { data, error } = await admin
      .from('planning_entries')
      .update({ department: to.dept, employee: to.emp })
      .eq('department', from.dept)
      .eq('employee', from.emp)
      .select('id')

    if (error) {
      // 23505 = unique_violation op (year, month, day, department, employee):
      // onder de nieuwe naam staat op dezelfde dag al een invoer. Samenvoegen
      // zou betekenen dat één van de twee verdwijnt, en welke dat moet zijn
      // kan deze route niet weten. Dus niets doen en het melden.
      const conflict = (error as { code?: string }).code === '23505'
      results.push({
        ...r,
        ok: false,
        moved: 0,
        reason: conflict
          ? `Onder "${to.emp}" staan al invoeren op dezelfde dagen — eerst handmatig samenvoegen.`
          : error.message,
      })
      continue
    }

    results.push({ ...r, ok: true, moved: data?.length ?? 0 })
  }

  // Alleen wegschrijven als elke verhuizing gelukt is. Anders zou het rooster
  // een naam bevatten waar de cellen niet onder staan — precies de toestand
  // die deze route moet voorkomen.
  const failed = results.filter(r => !r.ok)
  if (failed.length > 0) {
    return Response.json({ results, configSaved: false }, { status: 409 })
  }

  const { error: configError } = await admin
    .from('planning_config')
    .upsert(
      { key: 'departments', value: departments as Department[], updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (configError) {
    return Response.json(
      { results, configSaved: false, reason: configError.message },
      { status: 500 }
    )
  }

  return Response.json({ results, configSaved: true })
}
