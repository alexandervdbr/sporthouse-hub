import type { CarBlock } from './blocking'
import { formatPeriod, periodsOverlap } from './time'
import type { PoolReservation } from './types'

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
