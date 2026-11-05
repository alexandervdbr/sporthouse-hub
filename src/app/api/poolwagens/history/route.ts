import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import { HISTORY_PAGE_SIZE, parseHistoryFilters } from '@/lib/poolwagens/history'
import { RESERVATION_COLUMNS, type PoolReservation } from '@/lib/poolwagens/types'

// GET — de ritten (reservaties die vertrokken zijn), nieuwste eerst, per 50.
// Filters: car, user, klant (zoekt in de gekoppelde klant en in de getypte
// naam), from/to (vertrekdag), open=1 (niet terug en geplande terugkomst
// voorbij), page.
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
  if (f.client) {
    // Gekoppelde klanten op hun huidige naam (een klant kan hernoemd zijn),
    // en elke reservatie op de naam die erbij staat (kopie of getypt).
    const { data: matches } = await supabase.from('clients').select('id').ilike('name', `%${f.client}%`).limit(100)
    const ids = (matches ?? []).map(c => c.id as string)
    q = q.or([`client_name.ilike.*${f.client}*`, ...(ids.length ? [`client_id.in.(${ids.join(',')})`] : [])].join(','))
  }
  if (f.fromISO) q = q.gte('departed_at', f.fromISO)
  if (f.untilISO) q = q.lt('departed_at', f.untilISO)
  if (f.open) q = q.is('arrived_at', null).lt('end_at', new Date().toISOString())

  const from = f.page * HISTORY_PAGE_SIZE
  const { data, error, count } = await q.order('departed_at', { ascending: false }).range(from, from + HISTORY_PAGE_SIZE - 1)
  if (error) return dbErrorResponse(error)

  type Row = PoolReservation & { pool_cars: { name: string } | { name: string }[] | null }
  const rows = (data ?? []) as unknown as Row[]

  // De naam van de wagen erbij, ook als hij intussen gearchiveerd is.
  const trips: (PoolReservation & { car_name: string })[] = rows.map(({ pool_cars, ...r }) => ({
    ...r,
    car_name: (Array.isArray(pool_cars) ? pool_cars[0]?.name : pool_cars?.name) ?? 'Wagen',
  }))
  return Response.json({ trips, total: count ?? trips.length, pageSize: HISTORY_PAGE_SIZE })
}
