import { createAdminClient } from '@/lib/supabase/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import type { GearItemBooking, GearItemHistory } from '@/lib/gear/types'

// Geschiedenis van één item: statuswijzigingen, boekingen (ook geannuleerde)
// en in welke kits het zat. Nieuwste eerst.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const [log, lines, members] = await Promise.all([
    supabase.from('gear_status_log').select('id, old_status, new_status, note, changed_by_name, changed_at')
      .eq('item_id', id).order('changed_at', { ascending: false }),
    supabase.from('gear_booking_items')
      .select('via_kit_name, gear_bookings(id, start_date, end_date, person_name, client_id, note, created_by_name, created_at, cancelled_at)')
      .eq('item_id', id),
    supabase.from('gear_kit_members').select('kit_id, added_at, added_by_name, removed_at, removed_by_name, gear_kits(name)')
      .eq('item_id', id).order('added_at', { ascending: false }),
  ])
  const failed = [log, lines, members].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  type Row = Omit<GearItemBooking, 'client' | 'via_kit_name'> & { client_id: string | null }
  const rows = (lines.data ?? [])
    .map(l => ({ b: l.gear_bookings as unknown as Row | null, via: l.via_kit_name as string | null }))
    .filter((x): x is { b: Row; via: string | null } => !!x.b)

  const clientIds = [...new Set(rows.map(r => r.b.client_id).filter((c): c is string => !!c))]
  const clients = new Map<string, { id: string; name: string; color: string | null }>()
  if (clientIds.length) {
    const { data } = await createAdminClient().from('clients').select('id, name, color').in('id', clientIds)
    for (const c of data ?? []) clients.set(c.id, c)
  }

  const history: GearItemHistory = {
    status: log.data ?? [],
    bookings: rows
      .map(({ b: { client_id, ...b }, via }) => ({ ...b, via_kit_name: via, client: client_id ? clients.get(client_id) ?? null : null }))
      .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    memberships: (members.data ?? []).map(m => ({
      kit_id: m.kit_id,
      kit_name: (m.gear_kits as unknown as { name: string } | null)?.name ?? 'onbekende kit',
      added_at: m.added_at, added_by_name: m.added_by_name, removed_at: m.removed_at, removed_by_name: m.removed_by_name,
    })),
  }
  return Response.json(history)
}
