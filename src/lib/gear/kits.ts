import { findConflicts, type BookedUnit, type Conflict, type DateRange } from './ranges'
import type { GearBooking, GearItem, GearKit } from './types'

// Een kit boeken = de items boeken die er nu in zitten. Per onderdeel kan dat
// niet lukken: defect, uit dienst, of op die dagen al elders weg. Zo'n
// onderdeel gaat alleen mee als je het expliciet weglaat ("zonder …"); de
// database weigert het anders ook.

/** Item → de kit waar het nu in zit. */
export function kitByItem(kits: GearKit[]): Map<string, GearKit> {
  const m = new Map<string, GearKit>()
  for (const k of kits) for (const id of k.item_ids) m.set(id, k)
  return m
}

/** Alle regels van de geladen boekingen, per item, voor botsingen. */
export function bookedLines(bookings: GearBooking[]): BookedUnit[] {
  return bookings.flatMap(b => b.lines.map(l => ({
    bookingId: b.id,
    unitId: l.item_id,
    range: { start: b.start_date, end: b.end_date },
    cancelled: false,
    holderLabel: [b.person_name, b.client?.name].filter(Boolean).join(' · ') || 'onbekend',
  })))
}

export type PartState = 'ok' | 'beperkt' | 'defect' | 'uit_dienst' | 'elders'

export interface PartCheck {
  item: GearItem
  state: PartState
  conflicts: Conflict[]
  /** Moet weg ("zonder …") om de kit te kunnen boeken. */
  blocking: boolean
}

export function checkKitParts(
  kit: GearKit,
  items: Map<string, GearItem>,
  range: DateRange,
  booked: BookedUnit[],
  ignoreBookingId?: string,
): PartCheck[] {
  return kit.item_ids
    .map(id => items.get(id))
    .filter((i): i is GearItem => !!i)
    .map(item => {
      const conflicts = findConflicts([item.id], range, booked, ignoreBookingId)
      const state: PartState =
        item.status === 'defect' || item.status === 'uit_dienst' ? item.status
        : conflicts.length ? 'elders'
        : item.status === 'beperkt' ? 'beperkt' : 'ok'
      return { item, state, conflicts, blocking: state === 'defect' || state === 'uit_dienst' || state === 'elders' }
    })
}

/** De lijst voor de API: losse items, kits, en wat er bewust weggelaten is. */
export function bookingSelection(
  looseItemIds: string[],
  kitIds: string[],
  excluded: Set<string>,
  kits: Map<string, GearKit>,
): { item_ids: string[]; kit_ids: string[]; excluded_item_ids: string[] } {
  const inChosenKits = new Set(kitIds.flatMap(k => kits.get(k)?.item_ids ?? []))
  return {
    item_ids: looseItemIds,
    kit_ids: kitIds,
    excluded_item_ids: [...excluded].filter(id => inChosenKits.has(id)),
  }
}

/**
 * Een bestaande boeking terug opsplitsen voor het formulier: welke kits
 * (via_kit), welke losse items, en welke onderdelen van die kits er nu niet
 * in zitten (die waren weggelaten, of zijn er later bij gekomen).
 */
export function selectionFromBooking(booking: GearBooking, kits: Map<string, GearKit>) {
  const kitIds = [...new Set(booking.lines.map(l => l.via_kit_id).filter((k): k is string => !!k && kits.has(k)))]
  const booked = new Set(booking.lines.map(l => l.item_id))
  const viaKnownKit = new Set(booking.lines.filter(l => l.via_kit_id && kits.has(l.via_kit_id)).map(l => l.item_id))
  const loose = booking.lines.filter(l => !viaKnownKit.has(l.item_id)).map(l => l.item_id)
  const excluded = new Set(kitIds.flatMap(k => (kits.get(k)?.item_ids ?? []).filter(id => !booked.has(id))))
  // Een item dat intussen in een gekozen kit zit maar los geboekt staat: via de kit.
  const inKits = new Set(kitIds.flatMap(k => kits.get(k)?.item_ids ?? []))
  return { kitIds, looseItemIds: loose.filter(id => !inKits.has(id)), excluded }
}

/**
 * Wat een verhuis met de komende boekingen zou doen, voor het dialoogvenster
 * in Beheer. Zelfde regels als gear_move_item() in de database (0074):
 * alleen boekingen die nog moeten beginnen; uit die "via" de oude kit (niet
 * als het item het enige stuk is), in die "via" de nieuwe kit (niet als het
 * item die dagen al elders weg is).
 */
export function previewMove(
  itemId: string,
  fromKitId: string | null,
  toKitId: string | null,
  bookings: GearBooking[],
  today: string,
): { remove: MoveStep[]; add: MoveStep[] } {
  const upcoming = bookings.filter(b => b.start_date > today)
  const remove: MoveStep[] = !fromKitId ? [] : upcoming
    .filter(b => b.lines.some(l => l.item_id === itemId && l.via_kit_id === fromKitId))
    .map(b => b.lines.length === 1
      ? { booking: b, ok: false, reason: 'Het is het enige stuk in die boeking; annuleer de boeking als hij niet meer nodig is.' }
      : { booking: b, ok: true })
  const add: MoveStep[] = !toKitId ? [] : upcoming
    .filter(b => b.lines.some(l => l.via_kit_id === toKitId) && !b.lines.some(l => l.item_id === itemId))
    .map(b => {
      const clash = bookings.find(o => o.id !== b.id && o.lines.some(l => l.item_id === itemId)
        && o.start_date <= b.end_date && b.start_date <= o.end_date)
      return clash
        ? { booking: b, ok: false, reason: `Al geboekt: ${[clash.person_name, clash.client?.name].filter(Boolean).join(' · ') || 'onbekend'} (${clash.start_date} – ${clash.end_date})` }
        : { booking: b, ok: true }
    })
  return { remove, add }
}

export interface MoveStep {
  booking: GearBooking
  ok: boolean
  reason?: string
}
