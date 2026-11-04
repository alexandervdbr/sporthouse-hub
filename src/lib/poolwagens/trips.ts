import type { PoolReservation } from './types'

// De toestand van een reservatie/rit op een gegeven moment, en welke
// reservaties in het gedrang komen door een rit die te laat terug is.
// Dezelfde regel als pool_claim_late_notifications() in de database (0077).

export type TripState =
  | 'gepland'        // nog niet vertrokken
  | 'onderweg'       // vertrokken, geplande terugkomst nog niet voorbij
  | 'te_laat'        // vertrokken, niet terug, geplande terugkomst voorbij
  | 'teruggebracht'  // aangekomen

type R = Pick<PoolReservation, 'departed_at' | 'arrived_at' | 'end_at'>

export function tripState(r: R, now: Date): TripState {
  if (r.arrived_at) return 'teruggebracht'
  if (!r.departed_at) return 'gepland'
  return Date.parse(r.end_at) < now.getTime() ? 'te_laat' : 'onderweg'
}

/** Een open rit: vertrokken, nog niet terug, en de geplande terugkomst is voorbij. */
export function isOpenTrip(r: R, now: Date): boolean {
  return tripState(r, now) === 'te_laat'
}

/** Hoe ver vooruit een volgende reservatie in het gedrang komt. */
export const ENDANGERED_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Reservaties die in het gedrang komen: per wagen met een rit die te laat
 * is, de eerstvolgende reservatie die nog niet vertrokken is en start vóór
 * nu + 24 uur. Geeft per bedreigde reservatie de te late rit terug.
 */
export function endangeredReservations(
  reservations: Pick<PoolReservation, 'id' | 'car_id' | 'start_at' | 'end_at' | 'departed_at' | 'arrived_at'>[],
  now: Date,
): Map<string, string> {
  const out = new Map<string, string>()
  const horizon = now.getTime() + ENDANGERED_WINDOW_MS
  for (const late of reservations) {
    if (!isOpenTrip(late, now)) continue
    const lateEnd = Date.parse(late.end_at)
    const next = reservations
      .filter(r => r.car_id === late.car_id && r.id !== late.id && !r.departed_at && Date.parse(r.start_at) >= lateEnd)
      .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0]
    if (next && Date.parse(next.start_at) < horizon) out.set(next.id, late.id)
  }
  return out
}

/** Mag deze gebruiker de reservatie wijzigen of annuleren? Zoals de database. */
export function canChangeReservation(
  r: Pick<PoolReservation, 'user_id' | 'created_by' | 'departed_at'>,
  userId: string,
  manage: boolean,
): boolean {
  if (manage) return true
  return !r.departed_at && (r.user_id === userId || r.created_by === userId)
}

/** Mag deze gebruiker vertrek of aankomst registreren? Eigen rit of beheer. */
export function canRegisterTrip(r: Pick<PoolReservation, 'user_id' | 'created_by'>, userId: string, manage: boolean): boolean {
  return manage || r.user_id === userId || r.created_by === userId
}
