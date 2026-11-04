import { shortNames } from '@/lib/gear/labels'
import { carBlock, type CarBlock } from './blocking'
import { brusselsDay, formatClock, shortDayLabel } from './time'
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
  /** Getekende breedte: minstens de minimumbreedte, zodat het label leesbaar is. */
  visualWidth: number
  /** Op welke baan in de rij (0, 1, …): balken die elkaar zouden raken, komen onder elkaar. */
  lane: number
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
  /** Aantal banen in deze rij (minstens 1). */
  lanes: number
}

export interface Window {
  startMs: number
  endMs: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** "9:00–12:00" op één dag; anders met de weekdag erbij: "ma 9:00–do 17:00". */
export function barTime(startISO: string, endISO: string): string {
  const a = brusselsDay(startISO), b = brusselsDay(endISO)
  if (a === b) return `${formatClock(startISO)}–${formatClock(endISO)}`
  return `${shortDayLabel(a).slice(0, 2)} ${formatClock(startISO)}–${shortDayLabel(b).slice(0, 2)} ${formatClock(endISO)}`
}

export function buildPoolGrid(
  planning: PoolPlanning,
  window: Window,
  userId: string,
  now: Date = new Date(planning.now),
  /** Het uur vooraan in het label (week en dag); de maand is een overzicht zonder. */
  withTime = false,
  /**
   * Minimale getekende breedte van een balk, in procent van het venster. In
   * de week is een rit van een uur anders maar 1/168 breed — een bolletje.
   */
  minWidthPct = 0,
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
          visualWidth: Math.min(Math.max(width, minWidthPct), 100 - left),
          lane: 0,
          continuesBefore: startMs < window.startMs,
          continuesAfter: visibleEnd > window.endMs,
          lateLeft,
          lateWidth,
          label: [
            withTime ? barTime(r.departed_at ?? r.start_at, r.arrived_at ?? r.end_at) : null,
            short.get(r.person_name) ?? r.person_name,
            r.client_name,
          ].filter(Boolean).join(' · '),
          state,
          endangered: endangered.has(r.id),
          blocked: !!block && state !== 'teruggebracht' && visibleEnd >= now.getTime(),
          mine: r.user_id === userId || r.created_by === userId,
        })
      }
      bars.sort((a, b) => a.left - b.left)
      return { car, block, bars, lanes: assignLanes(bars) }
    })
}


/**
 * Verdeel de balken over banen: een balk gaat op de eerste baan waar de vorige
 * (getekende) balk al gedaan is. Verwacht de balken gesorteerd op left; zet
 * bar.lane en geeft het aantal banen terug.
 */
export function assignLanes(bars: Pick<GridBar, 'left' | 'visualWidth' | 'lane'>[]): number {
  const ends: number[] = []
  for (const bar of bars) {
    let lane = ends.findIndex(end => end <= bar.left + 1e-9)
    if (lane === -1) { lane = ends.length; ends.push(0) }
    ends[lane] = bar.left + bar.visualWidth
    bar.lane = lane
  }
  return Math.max(1, ends.length)
}
