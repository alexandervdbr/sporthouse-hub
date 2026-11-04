import { shortNames } from '@/lib/gear/labels'
import { carBlock, type CarBlock } from './blocking'
import { endangeredReservations, tripState, type TripState } from './trips'
import type { PoolCar, PoolPlanning, PoolReservation } from './types'

// Wagens + reservaties → wat het raster tekent: per wagen één rij, de dagen
// van de maand als kolommen (zoals de materiaalplanner). Anders dan daar
// staat een balk op het juiste uur: links en breedte in procent van het
// venster. Het raster zelf rekent niets uit.

export interface GridBar {
  reservationId: string
  /** Positie in procent van de breedte van het venster. */
  left: number
  width: number
  continuesBefore: boolean
  continuesAfter: boolean
  /** Te laat: het stuk na de geplande terugkomst tot nu, in procent. */
  lateLeft: number | null
  lateWidth: number | null
  label: string
  state: TripState
  /** Deze reservatie komt in het gedrang door een rit die te laat is. */
  endangered: boolean
  /** De wagen is geblokkeerd terwijl deze reservatie nog loopt of komt. */
  blocked: boolean
  mine: boolean
}

export interface GridCarRow {
  car: PoolCar
  block: CarBlock | null
  bars: GridBar[]
}

export interface Window {
  startMs: number
  endMs: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function buildPoolGrid(
  planning: PoolPlanning,
  window: Window,
  userId: string,
  now: Date = new Date(planning.now),
): GridCarRow[] {
  const span = window.endMs - window.startMs
  const pct = (ms: number) => ((clamp(ms, window.startMs, window.endMs) - window.startMs) / span) * 100
  const short = shortNames([...new Set(planning.reservations.map(r => r.person_name))])
  const endangered = endangeredReservations(planning.reservations, now)

  const blockingByCar = new Map<string, true>()
  for (const d of planning.blockingDamage) blockingByCar.set(d.car_id, true)

  const byCar = new Map<string, PoolReservation[]>()
  for (const r of planning.reservations) byCar.set(r.car_id, [...(byCar.get(r.car_id) ?? []), r])

  return planning.cars
    .filter(c => !c.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    .map(car => {
      const block = carBlock(car, blockingByCar.has(car.id) ? [{ severity: 'ernstig', status: 'gemeld', block_lifted_at: null }] : [])
      const bars: GridBar[] = []
      for (const r of byCar.get(car.id) ?? []) {
        const state = tripState(r, now)
        // Getekend van het werkelijke vertrek (als dat er is) tot de werkelijke
        // aankomst, of tot de geplande terugkomst zolang de rit loopt.
        const startMs = Date.parse(r.departed_at ?? r.start_at)
        const plannedEnd = Date.parse(r.end_at)
        const endMs = r.arrived_at ? Date.parse(r.arrived_at) : plannedEnd
        const lateEndMs = state === 'te_laat' ? now.getTime() : null
        const visibleEnd = Math.max(endMs, lateEndMs ?? 0)
        if (visibleEnd <= window.startMs || startMs >= window.endMs) continue

        const left = pct(startMs)
        const width = Math.max(pct(endMs) - left, 0)
        const lateLeft = lateEndMs !== null ? pct(plannedEnd) : null
        const lateWidth = lateEndMs !== null ? Math.max(pct(lateEndMs) - pct(plannedEnd), 0) : null

        bars.push({
          reservationId: r.id,
          left,
          width,
          continuesBefore: startMs < window.startMs,
          continuesAfter: visibleEnd > window.endMs,
          lateLeft,
          lateWidth,
          label: [short.get(r.person_name) ?? r.person_name, r.project?.name].filter(Boolean).join(' · '),
          state,
          endangered: endangered.has(r.id),
          blocked: !!block && state !== 'teruggebracht' && visibleEnd >= now.getTime(),
          mine: r.user_id === userId,
        })
      }
      return { car, block, bars: bars.sort((a, b) => a.left - b.left) }
    })
}

