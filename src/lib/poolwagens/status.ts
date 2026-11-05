import { addDays } from '@/lib/gear/dates'
import { shortNames } from '@/lib/gear/labels'
import { carBlock, type CarBlock } from './blocking'
import { addMinutesLocal, brusselsDay, formatClock, formatWhen, nowLocal, periodsOverlap } from './time'
import { tripState } from './trips'
import type { PoolCar, PoolPlanning, PoolReservation } from './types'

// Wat het blok "Beschikbaarheid" toont: bij "Nu" de toestand van elke wagen,
// bij een andere periode of hij dan vrij is. Puur: planning en
// tijdstip erin, regels eruit. Dezelfde regels als de database (blokkade:
// pool_car_block_reason, overlap: pool_conflicts); de database beslist.

export type CarNowKind = 'vrij' | 'gereserveerd' | 'onderweg' | 'te_laat' | 'geblokkeerd'

export type CarNowAction =
  | { kind: 'vertrekken' }
  | { kind: 'aankomst'; reservationId: string }
  | { kind: 'details'; reservationId: string }
  | { kind: 'geen' }

export interface CarNow {
  car: PoolCar
  block: CarBlock | null
  kind: CarNowKind
  /** De toestand in woorden, bv. "Onderweg met Jan tot 15:00". */
  label: string
  /** De rit of reservatie die nu loopt, als die er is. */
  current: PoolReservation | null
  next: PoolReservation | null
  /** "Volgende: morgen 9:00 · Jan", of null. */
  nextLabel: string | null
  action: CarNowAction
}

export const NOW_COLOR: Record<CarNowKind, string> = {
  vrij: '#3A913F',
  gereserveerd: '#eab308',
  onderweg: '#0ea5e9',
  te_laat: '#ef4444',
  geblokkeerd: '#ef4444',
}

/** Is dit de rit of reservatie van deze gebruiker (op naam of zelf gemaakt)? */
export const isMine = (r: Pick<PoolReservation, 'user_id' | 'created_by'>, userId: string) =>
  r.user_id === userId || r.created_by === userId

/** Per wagen: de ernstige schade die hem nu blokkeert, als blokkade. */
export function blockFor(car: PoolCar, planning: Pick<PoolPlanning, 'blockingDamage'>): CarBlock | null {
  const damaged = planning.blockingDamage.some(d => d.car_id === car.id)
  return carBlock(car, damaged ? [{ severity: 'ernstig', status: 'gemeld', block_lifted_at: null }] : [])
}

/** Korte reden voor de statuslijst: "ernstige schade", of de notitie van beheer. */
function shortBlockReason(block: CarBlock): string {
  if (block.kind === 'schade') return 'ernstige schade'
  const note = /\((.*)\)$/.exec(block.reason)?.[1]
  return note || (block.kind === 'gearchiveerd' ? 'gearchiveerd' : 'niet beschikbaar')
}

export function carsNow(planning: PoolPlanning, userId: string, now: Date, canBook = true): CarNow[] {
  const nowMs = now.getTime()
  const today = brusselsDay(now)
  const first = shortNames([...new Set(planning.reservations.map(r => r.person_name))])
  const name = (r: PoolReservation) => first.get(r.person_name) ?? r.person_name

  return planning.cars
    .filter(c => !c.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    .map(car => {
      const block = blockFor(car, planning)
      const mineList = planning.reservations.filter(r => r.car_id === car.id)
      const open = mineList.find(r => r.departed_at && !r.arrived_at) ?? null
      const reservedNow = mineList.find(r => !r.departed_at
        && Date.parse(r.start_at) <= nowMs && nowMs < Date.parse(r.end_at)) ?? null
      const current = open ?? reservedNow
      const next = mineList
        .filter(r => !r.departed_at && r.id !== current?.id && Date.parse(r.start_at) > nowMs)
        .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0] ?? null

      let kind: CarNowKind
      let label: string
      if (open && tripState(open, now) === 'te_laat') {
        kind = 'te_laat'; label = `Te laat terug (${name(open)})`
      } else if (open) {
        kind = 'onderweg'; label = `Onderweg met ${name(open)} tot ${formatWhen(open.end_at, today)}`
      } else if (block) {
        kind = 'geblokkeerd'; label = `Geblokkeerd: ${shortBlockReason(block)}`
      } else if (reservedNow) {
        kind = 'gereserveerd'; label = `Gereserveerd voor ${name(reservedNow)} tot ${formatWhen(reservedNow.end_at, today)}`
      } else {
        kind = 'vrij'; label = 'Vrij'
      }

      let action: CarNowAction
      if (open && isMine(open, userId)) action = { kind: 'aankomst', reservationId: open.id }
      else if (kind === 'vrij' && canBook) action = { kind: 'vertrekken' }
      else if (current) action = { kind: 'details', reservationId: current.id }
      else action = { kind: 'geen' }

      return {
        car, block, kind, label, current, next, action,
        nextLabel: next ? `Volgende: ${formatWhen(next.start_at, today)} · ${name(next)}` : null,
      }
    })
}

// ── Beschikbaarheid in een andere periode dan nu ────────────────────────────

export type PeriodChoice = 'nu' | 'straks' | 'morgen' | 'kies'

export const PERIOD_LABEL: Record<PeriodChoice, string> = {
  nu: 'Nu', straks: 'Straks', morgen: 'Morgen', kies: 'Kies periode',
}

/**
 * De periode (kloktijden) bij een keuze: Straks = nu tot +3 uur, Morgen =
 * 09:00–17:00. "Nu" en "Kies periode" hebben er geen vaste.
 */
export function presetPeriod(choice: 'straks' | 'morgen', now: Date): { start: string; end: string } {
  if (choice === 'straks') {
    const start = nowLocal(now)
    return { start, end: addMinutesLocal(start, 180) ?? start }
  }
  const tomorrow = addDays(brusselsDay(now), 1)
  return { start: `${tomorrow}T09:00`, end: `${tomorrow}T17:00` }
}

export type PeriodKind = 'vrij' | 'bezet' | 'geblokkeerd'

export type PeriodAction =
  | { kind: 'reserveren' }
  | { kind: 'aankomst'; reservationId: string }
  | { kind: 'details'; reservationId: string }
  | { kind: 'geen' }

export interface CarInPeriod {
  car: PoolCar
  block: CarBlock | null
  kind: PeriodKind
  /** "Vrij", "Bezet: Jan morgen 9:00–12:00", "Geblokkeerd: onderhoud". */
  label: string
  /** De eerste reservatie die met de periode botst. */
  clash: PoolReservation | null
  /** De wagen is nog niet terug van een rit waarvan de geplande terugkomst voorbij is. */
  notBack: boolean
  action: PeriodAction
}

const KIND_ORDER: Record<PeriodKind, number> = { vrij: 0, bezet: 1, geblokkeerd: 2 }

/**
 * Per actieve wagen: vrij, bezet of geblokkeerd in [start, einde), met de
 * vrije bovenaan. Overlap zoals pool_conflicts, blokkade zoals
 * pool_car_block_reason (de pure functies hierboven en in time.ts).
 */
export function carsInPeriod(
  planning: PoolPlanning, startISO: string, endISO: string, userId: string, now: Date, canBook = true,
): CarInPeriod[] {
  const today = brusselsDay(now)
  const first = shortNames([...new Set(planning.reservations.map(r => r.person_name))])
  const period = { start: startISO, end: endISO }

  return planning.cars
    .filter(c => !c.archived_at)
    .map(car => {
      const block = blockFor(car, planning)
      const own = planning.reservations.filter(r => r.car_id === car.id)
      const clash = own
        .filter(r => periodsOverlap(period, { start: r.start_at, end: r.end_at }))
        .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0] ?? null
      const open = own.find(r => r.departed_at && !r.arrived_at) ?? null
      const kind: PeriodKind = block ? 'geblokkeerd' : clash ? 'bezet' : 'vrij'

      let label = 'Vrij'
      if (kind === 'geblokkeerd') label = `Geblokkeerd: ${shortBlockReason(block!)}`
      else if (clash) {
        const end = brusselsDay(clash.end_at) === brusselsDay(clash.start_at) ? formatClock(clash.end_at) : formatWhen(clash.end_at, today)
        label = `Bezet: ${first.get(clash.person_name) ?? clash.person_name} ${formatWhen(clash.start_at, today)}–${end}`
      }

      let action: PeriodAction
      if (open && isMine(open, userId)) action = { kind: 'aankomst', reservationId: open.id }
      else if (kind === 'vrij' && canBook) action = { kind: 'reserveren' }
      else if (clash) action = { kind: 'details', reservationId: clash.id }
      else action = { kind: 'geen' }

      return {
        car, block, kind, label, clash, action,
        notBack: !!open && tripState(open, now) === 'te_laat',
      }
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.car.name.localeCompare(b.car.name, 'nl'))
}
