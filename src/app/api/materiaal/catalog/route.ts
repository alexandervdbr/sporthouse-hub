import { createAdminClient } from '@/lib/supabase/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import type { GearCatalog, GearUnit, GearUnitContent } from '@/lib/gear/types'

// Alles wat de planner en Beheer over de catalogus nodig hebben, in één
// verzoek: categorieën, units met hun kit-inhoud, en de namen van de vaste
// houders.
export async function GET() {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [cats, units, contents] = await Promise.all([
    supabase.from('gear_categories').select('id, name, color, sort_order').order('sort_order').order('name'),
    supabase.from('gear_units')
      .select('id, category_id, name, quantity, sort_order, label_color, nd_size, warning, notes, status, status_note, home_client_id')
      .order('sort_order').order('name'),
    supabase.from('gear_unit_contents').select('id, unit_id, label, quantity, note, sort_order').order('sort_order'),
  ])
  const failed = [cats, units, contents].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  const byUnit = new Map<string, GearUnitContent[]>()
  for (const c of (contents.data ?? []) as GearUnitContent[]) {
    byUnit.set(c.unit_id, [...(byUnit.get(c.unit_id) ?? []), c])
  }
  const unitRows = (units.data ?? []) as Omit<GearUnit, 'contents'>[]

  // Klantnamen van de vaste houders via de server: klanten zijn per klant
  // afgeschermd (0024), maar "in samenspraak met Sporting Hasselt" moet
  // iedereen kunnen lezen die de planner ziet.
  const holderIds = [...new Set(unitRows.map(u => u.home_client_id).filter((id): id is string => !!id))]
  let holders: GearCatalog['holders'] = []
  if (holderIds.length) {
    const { data } = await createAdminClient().from('clients').select('id, name, color').in('id', holderIds)
    holders = data ?? []
  }

  const catalog: GearCatalog = {
    categories: cats.data ?? [],
    units: unitRows.map(u => ({ ...u, contents: byUnit.get(u.id) ?? [] })),
    holders,
  }
  return Response.json(catalog)
}
