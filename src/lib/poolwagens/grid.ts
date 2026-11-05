import { shortNames } from '@/lib/gear/labels'
import { carBlock, type CarBlock } from './blocking'
import { brusselsDay, formatClock, shortDayLabel } from './time'
import { endangeredReservations, tripState, type TripState } from './trips'
import type { PoolCar, PoolPlanning, PoolReservation } from './types'

// Wagens + reservaties → wat het raster tekent: per wagen één rij.
//
// In de dagweergave staat elke rit als balk op het juiste uur (links en
// breedte in procent van het venster). In de week- en maandweergave alleen
// een rit over meerdere dagen: een rit die op één dag begint en eindigt, wordt
// een compact blokje binnen die dagkolom (anders lijkt een rit van drie
// minuten tot de volgende dag te lopen). Het raster zelf rekent niets uit.

export interface GridBar {
  reservationId: string
  /** Positie in procent van de breedte van het venster. */
  left: number
  width: number
  /** Op welke baan in de rij (0, 1, …): balken die elkaar raken, komen onder elkaar. */
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

/** Een rit binnen één dag, in de week- en maandweergave. */
export interface GridBlock {
  reservationId: string
  /** "9:00–9:03 · Anna" */
  label: string
  /** De volledige tekst, voor de tooltip. */
  title: string
  state: TripState
  endangered: boolean
  blocked: boolean
  mine: boolean
}

export interface GridCarRow {
  car: PoolCar
  block: CarBlock | null
  bars: GridBar[]
  /** Aantal banen voor de balken (0 als er geen zijn). */
  lanes: number
  /** Per kolom de blokjes van die dag (alleen in week en maand; anders leeg). */
  dayBlocks: GridBlock[][]
  /** Hoeveel blokjes er op de drukste dag van deze rij staan. */
  maxBlocks: number
}

export interface Window {
  startMs: number
  endMs: number
}

export interface GridOptions {
  /** Het uur vooraan in het label van een balk (dag en week). */
  withTime?: boolean
  /**
   * De dagen van de kolommen (week en maand). Dan wordt een rit binnen één
   * dag een blokje in die kolom; zonder (dag) is alles een balk.
   */
  days?: string[]
}

/** Hoeveel blokjes een dagkolom toont; de rest wordt "+N meer". */
export const MAX_DAY_BLOCKS = 3

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** "9:00–12:00" op één dag; anders met de weekdag erbij: "ma 9:00–do 17:00". */
export function barTime(startISO: string, endISO: string): string {
  const a = brusselsDay(startISO), b = brusselsDay(endISO)
  if (a === b) return `${formatClock(startISO)}–${formatClock(endISO)}`
  return `${shortDayLabel(a).slice(0, 2)} ${formatClock(startISO)}–${shortDayLabel(b).slice(0, 2)} ${formatClock(endISO)}`
}

/** De Brusselse dag waarop een periode eindigt; een einde om middernacht hoort bij de dag ervoor. */
const lastDay = (endMs: number) => brusselsDay(new Date(endMs - 1))

const STATE_TEXT: Record<TripState, string> = {
  gepland: 'Gepland', onderweg: 'Onderweg', te_laat: 'Te laat terug', teruggebracht: 'Teruggebracht',
}

export function buildPoolGrid(
  planning: PoolPlanning,
  window: Window,
  userId: string,
  now: Date = new Date(planning.now),
  opts: GridOptions = {},
): GridCarRow[] {
  const span = window.endMs - window.startMs
  const pct = (ms: number) => ((clamp(ms, window.startMs, window.endMs) - window.startMs) / span) * 100
  const short = shortNames([...new Set(planning.reservations.map(r => r.person_name))])
  const endangered = endangeredReservations(planning.reservations, now)
  const dayIndex = new Map((opts.days ?? []).map((d, i) => [d, i]))

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
      const dayBlocks: GridBlock[][] = (opts.days ?? []).map(() => [])
      const sorted = [...(byCar.get(car.id) ?? [])].sort((a, b) => Date.parse(a.departed_at ?? a.start_at) - Date.parse(b.departed_at ?? b.start_at))

      for (const r of sorted) {
        const state = tripState(r, now)
        // Getekend van het werkelijke vertrek (als dat er is) tot de werkelijke
        // aankomst, of tot de geplande terugkomst zolang de rit loopt; een rit
        // die te laat is, loopt door tot nu.
        const startMs = Date.parse(r.departed_at ?? r.start_at)
        const plannedEnd = Date.parse(r.end_at)
        const endMs = r.arrived_at ? Date.parse(r.arrived_at) : plannedEnd
        const lateEndMs = state === 'te_laat' ? now.getTime() : null
        const visibleEnd = Math.max(endMs, lateEndMs ?? 0)
        if (visibleEnd <= window.startMs || startMs >= window.endMs) continue

        const person = short.get(r.person_name) ?? r.person_name
        const isEndangered = endangered.has(r.id)
        const isBlocked = !!block && state !== 'teruggebracht' && visibleEnd >= now.getTime()
        const mine = r.user_id === userId || r.created_by === userId

        // Week en maand: binnen één dag → een blokje in die kolom.
        const startDay = brusselsDay(new Date(startMs))
        const col = dayIndex.get(startDay)
        if (opts.days && col !== undefined && startDay === lastDay(visibleEnd)) {
          const label = `${formatClock(new Date(startMs))}–${formatClock(new Date(visibleEnd))} · ${person}`
          dayBlocks[col].push({
            reservationId: r.id,
            label,
            title: [label, r.client_name, STATE_TEXT[state]].filter(Boolean).join(' · '),
            state, endangered: isEndangered, blocked: isBlocked, mine,
          })
          continue
        }

        const left = pct(startMs)
        const width = Math.max(pct(endMs) - left, 0)
        const lateLeft = lateEndMs !== null ? pct(plannedEnd) : null
        const lateWidth = lateEndMs !== null ? Math.max(pct(lateEndMs) - pct(plannedEnd), 0) : null

        bars.push({
          reservationId: r.id,
          left,
          width,
          lane: 0,
          continuesBefore: startMs < window.startMs,
          continuesAfter: visibleEnd > window.endMs,
          lateLeft,
          lateWidth,
          label: [
            opts.withTime ? barTime(r.departed_at ?? r.start_at, r.arrived_at ?? r.end_at) : null,
            person,
            r.client_name,
          ].filter(Boolean).join(' · '),
          state,
          endangered: isEndangered,
          blocked: isBlocked,
          mine,
        })
      }
      bars.sort((a, b) => a.left - b.left)
      return {
        car, block, bars, dayBlocks,
        lanes: assignLanes(bars),
        maxBlocks: Math.max(0, ...dayBlocks.map(d => d.length)),
      }
    })
}

/**
 * Verdeel de balken over banen: een balk gaat op de eerste baan waar de vorige
 * balk al gedaan is (inclusief het te late stuk). Verwacht de balken
 * gesorteerd op left; zet bar.lane en geeft het aantal banen terug (0 zonder
 * balken).
 */
export function assignLanes(bars: Pick<GridBar, 'left' | 'width' | 'lane' | 'lateLeft' | 'lateWidth'>[]): number {
  const ends: number[] = []
  for (const bar of bars) {
    const end = Math.max(bar.left + bar.width, (bar.lateLeft ?? 0) + (bar.lateWidth ?? 0))
    let lane = ends.findIndex(e => e <= bar.left + 1e-9)
    if (lane === -1) { lane = ends.length; ends.push(0) }
    ends[lane] = end
    bar.lane = lane
  }
  return ends.length
}
