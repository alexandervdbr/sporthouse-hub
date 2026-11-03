import { createAdminClient } from '@/lib/supabase/server'
import { requireGear, dbErrorResponse } from '@/lib/gear/server'
import { isISODate } from '@/lib/gear/dates'
import { parseBookingInput } from '@/lib/gear/booking-input'
import type { GearBooking } from '@/lib/gear/types'

// GET ?start=&end= — de niet-geannuleerde boekingen die dat venster raken
// (de planner vraagt één maand tegelijk, niet de hele tabel).
// POST — boeken via gear_create_booking; de database controleert alles.

export async function GET(req: Request) {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const url = new URL(req.url)
  const start = url.searchParams.get('start') ?? ''
  const end = url.searchParams.get('end') ?? ''
  if (!isISODate(start) || !isISODate(end) || end < start) return new Response('start en end zijn verplicht', { status: 400 })

  const { data, error } = await supabase
    .from('gear_bookings')
    .select('id, start_date, end_date, booked_for_user_id, freelancer_id, external_name, person_name, client_id, project_id, note, created_by, created_by_name, gear_booking_items(item_id, via_kit_id, via_kit_name)')
    .is('cancelled_at', null)
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date')
  if (error) return dbErrorResponse(error)

  type Row = Omit<GearBooking, 'lines' | 'client' | 'project'> & {
    client_id: string | null
    project_id: string | null
    gear_booking_items: GearBooking['lines']
  }
  const rows = (data ?? []) as Row[]

  // Klant- en projectnamen via de server: die zijn per klant afgeschermd,
  // maar wie de planner ziet, moet kunnen lezen voor wie iets weg is.
  const clientIds = [...new Set(rows.map(r => r.client_id).filter((x): x is string => !!x))]
  const projectIds = [...new Set(rows.map(r => r.project_id).filter((x): x is string => !!x))]
  const admin = createAdminClient()
  const [clients, projects] = await Promise.all([
    clientIds.length ? admin.from('clients').select('id, name, color').in('id', clientIds) : Promise.resolve({ data: [] }),
    projectIds.length ? admin.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
  ])
  const clientById = new Map((clients.data ?? []).map(c => [c.id, c]))
  const projectById = new Map((projects.data ?? []).map(p => [p.id, p]))

  const bookings: GearBooking[] = rows.map(({ client_id, project_id, gear_booking_items, ...b }) => ({
    ...b,
    lines: gear_booking_items,
    client: client_id ? clientById.get(client_id) ?? null : null,
    project: project_id ? projectById.get(project_id) ?? null : null,
  }))
  return Response.json(bookings)
}

export async function POST(req: Request) {
  const auth = await requireGear('book')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = parseBookingInput(await req.json())
  if ('error' in parsed) return new Response(parsed.error, { status: 400 })

  const { data, error } = await supabase.rpc('gear_create_booking', parsed.args)
  if (error) return dbErrorResponse(error)
  return Response.json({ id: data }, { status: 201 })
}
