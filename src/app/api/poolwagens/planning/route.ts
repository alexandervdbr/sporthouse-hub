import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import { notifyLateReturns } from '@/lib/poolwagens/notify'
import { parsePlanningRange } from '@/lib/poolwagens/planning-range'
import { CAR_COLUMNS, RESERVATION_COLUMNS, type PoolPlanning, type PoolReservation } from '@/lib/poolwagens/types'

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (beide dagen inbegrepen), of ?month=YYYY-MM
// — alles voor de planning in één verzoek:
//   - de actieve wagens;
//   - de reservaties en ritten die het venster raken;
//   - ritten die nog niet terug zijn, waar ze ook begonnen;
//   - wat nu loopt en de komende 30 dagen (voor de statuslijst "Nu" en
//     "Mijn ritten", ook als je naar een andere week bladert);
//   - welke wagens door ernstige schade geblokkeerd zijn.
// Geen timer: de planner vraagt dit bij het openen, bij een ander venster en
// na een wijziging.

const UPCOMING_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const range = parsePlanningRange(new URL(req.url).searchParams)
  if ('error' in range) return new Response(range.error, { status: 400 })
  const { start, end } = range

  // Te laat terug? Dan eerst de push naar wie erna reserveerde (één keer).
  await notifyLateReturns(supabase)

  const now = new Date()
  const horizon = new Date(now.getTime() + UPCOMING_MS).toISOString()
  const [cars, inWindow, open, upcoming, damage] = await Promise.all([
    supabase.from('pool_cars').select(CAR_COLUMNS).is('archived_at', null).order('name'),
    supabase.from('pool_car_reservations').select(RESERVATION_COLUMNS)
      .is('cancelled_at', null).lt('start_at', end).gt('end_at', start).order('start_at'),
    supabase.from('pool_car_reservations').select(RESERVATION_COLUMNS)
      .is('cancelled_at', null).not('departed_at', 'is', null).is('arrived_at', null),
    supabase.from('pool_car_reservations').select(RESERVATION_COLUMNS)
      .is('cancelled_at', null).is('arrived_at', null).gt('end_at', now.toISOString()).lt('start_at', horizon)
      .order('start_at').limit(300),
    supabase.from('pool_car_damage_reports').select('id, car_id, created_at')
      .eq('severity', 'ernstig').neq('status', 'hersteld').is('block_lifted_at', null),
  ])
  const failed = [cars, inWindow, open, upcoming, damage].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  const rows = new Map<string, PoolReservation>()
  for (const r of [...(inWindow.data ?? []), ...(open.data ?? []), ...(upcoming.data ?? [])] as PoolReservation[]) rows.set(r.id, r)

  const planning: PoolPlanning = {
    cars: cars.data ?? [],
    reservations: [...rows.values()],
    blockingDamage: damage.data ?? [],
    now: now.toISOString(),
  }
  return Response.json(planning)
}
