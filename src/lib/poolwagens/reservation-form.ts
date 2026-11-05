import { shortNames } from '@/lib/gear/labels'
import type { CarBlock } from './blocking'
import { blockFor } from './status'
import { brusselsDay, formatPeriod, formatWhen, periodsOverlap } from './time'
import type { PoolCar, PoolPlanning, PoolReservation } from './types'

// Wat het reserveerformulier al ziet vóór het naar de server gaat: één
// melding, of null. Dezelfde regels als pool_create_reservation en
// pool_update_reservation (0077/0079/0080); de database beslist, dit spaart
// alleen een vergeefse klik. Zolang er een melding is, staat de knop uit.

export interface FormInput {
  kind: 'new' | 'edit' | 'now'
  carId: string
  startISO: string | null
  endISO: string | null
  editing: PoolReservation | null
  block: CarBlock | null
  reservations: PoolReservation[]
  now: Date
  manage: boolean
}

/** De reservatie die botst met de gekozen periode op die wagen, als die er is. */
export function findClash(i: Pick<FormInput, 'carId' | 'startISO' | 'endISO' | 'editing' | 'reservations'>): PoolReservation | null {
  if (!i.carId || !i.startISO || !i.endISO) return null
  const period = { start: i.startISO, end: i.endISO }
  return i.reservations.find(r => r.car_id === i.carId && r.id !== i.editing?.id
    && periodsOverlap(period, { start: r.start_at, end: r.end_at })) ?? null
}

export function clashText(r: Pick<PoolReservation, 'start_at' | 'end_at' | 'person_name'>): string {
  return `Deze wagen is dan al gereserveerd: ${formatPeriod(r.start_at, r.end_at)}, ${r.person_name}.`
}

export function reservationFormProblem(i: FormInput): string | null {
  const start = i.startISO ? Date.parse(i.startISO) : NaN
  const end = i.endISO ? Date.parse(i.endISO) : NaN
  if (Number.isNaN(end) || (i.kind !== 'now' && Number.isNaN(start))) return null // nog niet ingevuld

  if (i.kind === 'now') {
    if (end <= i.now.getTime()) return 'De verwachte terugkomst ligt in de toekomst.'
  } else {
    if (end <= start) return 'De terugkomst ligt na het vertrek.'
    if (end <= i.now.getTime() && !i.manage) return 'Een reservatie in het verleden kan alleen een beheerder maken.'
  }

  // Een bestaande reservatie op een geblokkeerde wagen verkorten mag; alles
  // anders (nieuw, verlengen, verplaatsen naar die wagen) niet.
  if (i.block) {
    const e = i.editing
    const grows = !e || i.carId !== e.car_id || start < Date.parse(e.start_at) || end > Date.parse(e.end_at)
    if (grows) return `${i.block.reason} en kan niet gereserveerd worden.`
  }

  const clash = findClash(i)
  return clash ? clashText(clash) : null
}

// ── De wagenkeuze in het formulier ──────────────────────────────────────────
// Zodra vertrek en terugkomst ingevuld zijn, staat bij elke wagen of hij dan
// vrij is. Overlap met findClash, blokkade met blockFor: dezelfde regels als
// hierboven en als de database.

export type CarChoiceKind = 'vrij' | 'bezet' | 'geblokkeerd'

export interface CarChoice {
  car: PoolCar
  kind: CarChoiceKind
  /** "Vrij", "Bezet door Jan tot 15:00" of "Geblokkeerd". */
  label: string
}

const CHOICE_ORDER: Record<CarChoiceKind, number> = { vrij: 0, bezet: 1, geblokkeerd: 2 }

export const NO_FREE_CAR_TEXT = 'Geen wagen vrij in deze periode.'

/**
 * Per actieve wagen: vrij, bezet of geblokkeerd in [vertrek, terugkomst), de
 * vrije bovenaan. Null zolang de periode niet (geldig) ingevuld is. De wagen
 * van een reservatie die je wijzigt telt niet als geblokkeerd: verkorten mag
 * (reservationFormProblem bewaakt de rest).
 */
export function carChoices(i: {
  planning: Pick<PoolPlanning, 'cars' | 'reservations' | 'blockingDamage'>
  startISO: string | null
  endISO: string | null
  editing: PoolReservation | null
  now: Date
}): CarChoice[] | null {
  if (!i.startISO || !i.endISO || Date.parse(i.endISO) <= Date.parse(i.startISO)) return null
  const today = brusselsDay(i.now)
  const first = shortNames([...new Set(i.planning.reservations.map(r => r.person_name))])
  return i.planning.cars
    .filter(c => !c.archived_at)
    .map((car): CarChoice => {
      const blocked = blockFor(car, i.planning) && i.editing?.car_id !== car.id
      if (blocked) return { car, kind: 'geblokkeerd', label: 'Geblokkeerd' }
      const clash = findClash({ carId: car.id, startISO: i.startISO, endISO: i.endISO, editing: i.editing, reservations: i.planning.reservations })
      if (clash) {
        return { car, kind: 'bezet', label: `Bezet door ${first.get(clash.person_name) ?? clash.person_name} tot ${formatWhen(clash.end_at, today)}` }
      }
      return { car, kind: 'vrij', label: 'Vrij' }
    })
    .sort((a, b) => CHOICE_ORDER[a.kind] - CHOICE_ORDER[b.kind] || a.car.name.localeCompare(b.car.name, 'nl'))
}

/**
 * Na een wijziging van de periode: blijft de gekozen wagen, of springt de
 * keuze naar de eerste vrije? `switched` is de wagen die niet meer vrij was.
 */
export function pickFreeCar(choices: CarChoice[] | null, carId: string): { carId: string; switched: PoolCar | null } {
  if (!choices) return { carId, switched: null }
  const current = choices.find(c => c.car.id === carId)
  if (current?.kind === 'vrij') return { carId, switched: null }
  const free = choices.find(c => c.kind === 'vrij')
  if (!free) return { carId, switched: null }
  return { carId: free.car.id, switched: current?.car ?? null }
}
