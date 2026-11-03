import { createAdminClient } from '@/lib/supabase/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import type { GearUnitBooking, GearUnitHistory } from '@/lib/gear/types'

// Geschiedenis van één unit: statuswijzigingen en boekingen (ook geannuleerde),
// nieuwste eerst.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const [log, lines] = await Promise.all([
    supabase.from('gear_status_log')
      .select('id, old_status, new_status, note, changed_by_name, changed_at')
      .eq('unit_id', id).order('changed_at', { ascending: false }),
    supabase.from('gear_booking_units')
      .select('gear_bookings(id, start_date, end_date, person_name, client_id, note, created_by_name, cancelled_at)')
      .eq('unit_id', id),
  ])
  const failed = [log, lines].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  type Row = Omit<GearUnitBooking, 'client'> & { client_id: string | null }
  const rows: Row[] = (lines.data ?? [])
    .map(l => l.gear_bookings as unknown as Row | null)
    .filter((b): b is Row => !!b)

  // Klantnamen via de server, om dezelfde reden als in /catalog.
  const clientIds = [...new Set(rows.map(b => b.client_id).filter((c): c is string => !!c))]
  const clients = new Map<string, { id: string; name: string; color: string | null }>()
  if (clientIds.length) {
    const { data } = await createAdminClient().from('clients').select('id, name, color').in('id', clientIds)
    for (const c of data ?? []) clients.set(c.id, c)
  }

  const history: GearUnitHistory = {
    status: log.data ?? [],
    bookings: rows
      .map(({ client_id, ...b }) => ({ ...b, client: client_id ? clients.get(client_id) ?? null : null }))
      .sort((a, b) => b.start_date.localeCompare(a.start_date)),
  }
  return Response.json(history)
}
