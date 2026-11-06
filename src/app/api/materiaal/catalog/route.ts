import { createAdminClient } from '@/lib/supabase/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import type { GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

// Alles wat de planner en Beheer over de catalogus nodig hebben, in één
// verzoek: categorieën, items, kits met hun onderdelen (in volgorde), en de
// namen van de klanten die verantwoordelijke zijn.

const ITEM_COLUMNS = 'id, category_id, name, model, number, serial_number, sort_order, label_color, nd_size, warning, notes, status, status_note, responsible_client_id, responsible_user_id, responsible_name, contact_user_id, contact_name'
const KIT_COLUMNS = 'id, category_id, name, label_color, warning, notes, sort_order, responsible_client_id, responsible_user_id, responsible_name, contact_user_id, contact_name'

export async function GET() {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [cats, items, kits, members] = await Promise.all([
    supabase.from('gear_categories').select('id, name, color, sort_order').order('sort_order').order('name'),
    supabase.from('gear_items').select(ITEM_COLUMNS).order('sort_order').order('name'),
    supabase.from('gear_kits').select(KIT_COLUMNS).is('dissolved_at', null).order('sort_order').order('name'),
    supabase.from('gear_kit_members').select('kit_id, item_id, sort_order').is('removed_at', null).order('sort_order'),
  ])
  const failed = [cats, items, kits, members].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  const parts = new Map<string, string[]>()
  for (const m of members.data ?? []) parts.set(m.kit_id, [...(parts.get(m.kit_id) ?? []), m.item_id])

  const itemRows = (items.data ?? []) as GearItem[]
  const kitRows = ((kits.data ?? []) as Omit<GearKit, 'item_ids'>[]).map(k => ({ ...k, item_ids: parts.get(k.id) ?? [] }))

  // Klantnamen via de server: klanten zijn per klant afgeschermd (0024), maar
  // "Verantwoordelijke: Sporting Hasselt" moet iedereen kunnen lezen.
  const clientIds = [...new Set([...itemRows, ...kitRows].map(r => r.responsible_client_id).filter((id): id is string => !!id))]
  let clients: GearCatalog['clients'] = []
  if (clientIds.length) {
    const { data } = await createAdminClient().from('clients').select('id, name, color').in('id', clientIds)
    clients = data ?? []
  }

  const catalog: GearCatalog = { categories: cats.data ?? [], items: itemRows, kits: kitRows, clients }
  return Response.json(catalog)
}
