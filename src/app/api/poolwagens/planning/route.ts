import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import { notifyLateReturns } from '@/lib/poolwagens/notify'
import { brusselsDayStartISO } from '@/lib/poolwagens/time'
import { CAR_COLUMNS, RESERVATION_COLUMNS, type PoolPlanning, type PoolReservation } from '@/lib/poolwagens/types'

// GET ?month=YYYY-MM — alles voor het planningsoverzicht van één maand in één
// verzoek: de actieve wagens, de reservaties en ritten die de maand raken
// (plus ritten die nog niet terug zijn, waar ze ook begonnen), en welke
// wagens door ernstige schade geblokkeerd zijn. Geen timer: de planner vraagt
// dit bij het openen, bij een andere maand en na een wijziging.

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export async function GET(req: Request) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const m = MONTH_RE.exec(new URL(req.url).searchParams.get('month') ?? '')
  if (!m) return new Response('month (YYYY-MM) is verplicht', { status: 400 })
  const year = Number(m[1]), month = Number(m[2])
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
  const start = brusselsDayStartISO(`${m[1]}-${m[2]}-01`)
  const end = brusselsDayStartISO(`${next}-01`)

  // Te laat terug? Dan eerst de push naar wie erna reserveerde (één keer).
  await notifyLateReturns(supabase)

  const [cars, inWindow, open, damage] = await Promise.all([
    supabase.from('pool_cars').select(CAR_COLUMNS).is('archived_at', null).order('name'),
    supabase.from('pool_car_reservations').select(RESERVATION_COLUMNS)
      .is('cancelled_at', null).lt('start_at', end).gt('end_at', start).order('start_at'),
    supabase.from('pool_car_reservations').select(RESERVATION_COLUMNS)
      .is('cancelled_at', null).not('departed_at', 'is', null).is('arrived_at', null),
    supabase.from('pool_car_damage_reports').select('id, car_id, created_at')
      .eq('severity', 'ernstig').neq('status', 'hersteld').is('block_lifted_at', null),
  ])
  const failed = [cars, inWindow, open, damage].find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)

  const rows = new Map<string, PoolReservation>()
  for (const r of [...(inWindow.data ?? []), ...(open.data ?? [])] as PoolReservation[]) rows.set(r.id, r)

  const planning: PoolPlanning = {
    cars: cars.data ?? [],
    reservations: [...rows.values()],
    blockingDamage: damage.data ?? [],
    now: new Date().toISOString(),
  }
  return Response.json(planning)
}
