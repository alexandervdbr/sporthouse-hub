import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import { HISTORY_PAGE_SIZE, parseHistoryFilters } from '@/lib/poolwagens/history'
import { RESERVATION_COLUMNS, type PoolReservation } from '@/lib/poolwagens/types'

// GET — de ritten (reservaties die vertrokken zijn), nieuwste eerst, per 50.
// Filters: car, user, project, from/to (vertrekdag), open=1 (niet terug en
// geplande terugkomst voorbij), page.
export async function GET(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const f = parseHistoryFilters(new URL(req.url).searchParams)
  let q = supabase.from('pool_car_reservations')
    .select(`${RESERVATION_COLUMNS}, pool_cars(name)`, { count: 'exact' })
    .is('cancelled_at', null)
    .not('departed_at', 'is', null)
  if (f.car) q = q.eq('car_id', f.car)
  if (f.user) q = q.eq('user_id', f.user)
  if (f.project) q = q.eq('project_id', f.project)
  if (f.fromISO) q = q.gte('departed_at', f.fromISO)
  if (f.untilISO) q = q.lt('departed_at', f.untilISO)
  if (f.open) q = q.is('arrived_at', null).lt('end_at', new Date().toISOString())

  const from = f.page * HISTORY_PAGE_SIZE
  const { data, error, count } = await q.order('departed_at', { ascending: false }).range(from, from + HISTORY_PAGE_SIZE - 1)
  if (error) return dbErrorResponse(error)

  type Row = Omit<PoolReservation, 'project'> & { project_id: string | null; pool_cars: { name: string } | { name: string }[] | null }
  const rows = (data ?? []) as unknown as Row[]
  const projectIds = [...new Set(rows.map(r => r.project_id).filter((x): x is string => !!x))]
  const projects = projectIds.length
    ? await supabase.from('projects').select('id, name').in('id', projectIds)
    : { data: [] as { id: string; name: string }[] }
  const byId = new Map((projects.data ?? []).map(p => [p.id, p]))

  // De naam van de wagen erbij, ook als hij intussen gearchiveerd is.
  const trips: (PoolReservation & { car_name: string })[] = rows.map(({ project_id, pool_cars, ...r }) => ({
    ...r,
    car_name: (Array.isArray(pool_cars) ? pool_cars[0]?.name : pool_cars?.name) ?? 'Wagen',
    project: project_id ? byId.get(project_id) ?? { id: project_id, name: 'Project' } : null,
  }))
  return Response.json({ trips, total: count ?? trips.length, pageSize: HISTORY_PAGE_SIZE })
}
