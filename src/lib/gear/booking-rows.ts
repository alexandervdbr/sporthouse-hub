import { createAdminClient } from '@/lib/supabase/server'
import { normalizeTime } from './times'
import type { GearBooking } from './types'

// Boekingen zoals de planner ze krijgt, gedeeld door /api/materiaal/bookings
// en "Mijn boekingen". Klant- en projectnamen via de server: die zijn per
// klant afgeschermd, maar wie de planner ziet, moet kunnen lezen voor wie
// iets weg is.

export const BOOKING_SELECT =
  'id, start_date, end_date, start_time, end_time, booked_for_user_id, freelancer_id, external_name, person_name, client_id, project_id, note, created_by, created_by_name, created_at, gear_booking_items(item_id, via_kit_id, via_kit_name)'

type Row = Omit<GearBooking, 'lines' | 'client' | 'project'> & {
  client_id: string | null
  project_id: string | null
  gear_booking_items: GearBooking['lines']
}

export async function shapeBookings(data: unknown[] | null): Promise<GearBooking[]> {
  const rows = (data ?? []) as Row[]
  const clientIds = [...new Set(rows.map(r => r.client_id).filter((x): x is string => !!x))]
  const projectIds = [...new Set(rows.map(r => r.project_id).filter((x): x is string => !!x))]
  const admin = createAdminClient()
  const [clients, projects] = await Promise.all([
    clientIds.length ? admin.from('clients').select('id, name, color').in('id', clientIds) : Promise.resolve({ data: [] }),
    projectIds.length ? admin.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
  ])
  const clientById = new Map((clients.data ?? []).map(c => [c.id, c]))
  const projectById = new Map((projects.data ?? []).map(p => [p.id, p]))
  return rows.map(({ client_id, project_id, gear_booking_items, ...b }) => ({
    ...b,
    start_time: normalizeTime(b.start_time),
    end_time: normalizeTime(b.end_time),
    lines: gear_booking_items,
    client: client_id ? clientById.get(client_id) ?? null : null,
    project: project_id ? projectById.get(project_id) ?? null : null,
  }))
}
