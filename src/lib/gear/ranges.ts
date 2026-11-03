import { diffDays, eachDay, isISODate } from './dates'

// Een boeking loopt over hele dagen, begin en einde inbegrepen: van 3 tot 5
// november is drie dagen. Dat is dezelfde betekenis als de daterange '[ ]' die
// de database straks gebruikt om dubbele boekingen te weigeren — wat hier
// "overlapt" heet, weigert de database ook.

export interface DateRange {
  start: string
  end: string
}

export type RangeError = 'ongeldige_datum' | 'einde_voor_begin'

export function validateRange(range: DateRange): RangeError | null {
  if (!isISODate(range.start) || !isISODate(range.end)) return 'ongeldige_datum'
  if (range.end < range.start) return 'einde_voor_begin'
  return null
}

/** Aantal dagen in de periode, begin en einde inbegrepen. */
export function rangeLength(range: DateRange): number {
  return diffDays(range.start, range.end) + 1
}

/** Delen twee periodes minstens één dag? Aansluitend (5 → 6) overlapt niet. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end
}

/** De gedeelde dagen van twee periodes, of null als ze niet overlappen. */
export function intersectRanges(a: DateRange, b: DateRange): DateRange | null {
  if (!rangesOverlap(a, b)) return null
  return { start: a.start > b.start ? a.start : b.start, end: a.end < b.end ? a.end : b.end }
}

// ─── Conflicten ──────────────────────────────────────────────────────────────

/** Eén unit binnen een bestaande boeking, zoals de planner die inlaadt. */
export interface BookedUnit {
  bookingId: string
  unitId: string
  range: DateRange
  cancelled: boolean
  /** Voor de melding: bij wie of welke klant het materiaal dan is. */
  holderLabel: string
}

export interface Conflict {
  unitId: string
  bookingId: string
  holderLabel: string
  /** De dagen waarop het botst, niet de hele andere boeking. */
  days: DateRange
}

/**
 * Welke van de gevraagde units zijn op die dagen al geboekt?
 *
 * Geannuleerde boekingen tellen niet mee: ze blijven bewaard voor de
 * geschiedenis, maar houden niets meer bezet. Bij het wijzigen van een
 * bestaande boeking geef je die zelf mee als `ignoreBookingId`, anders botst
 * ze met zichzelf.
 */
export function findConflicts(
  unitIds: string[],
  range: DateRange,
  booked: BookedUnit[],
  ignoreBookingId?: string,
): Conflict[] {
  const wanted = new Set(unitIds)
  const out: Conflict[] = []
  for (const b of booked) {
    if (b.cancelled || !wanted.has(b.unitId) || b.bookingId === ignoreBookingId) continue
    const days = intersectRanges(range, b.range)
    if (days) out.push({ unitId: b.unitId, bookingId: b.bookingId, holderLabel: b.holderLabel, days })
  }
  return out.sort((x, y) => x.unitId.localeCompare(y.unitId) || x.days.start.localeCompare(y.days.start))
}

/** De losse dagen waarop iets botst, voor de dagchips in het boekingsformulier. */
export function conflictDays(conflicts: Conflict[]): Set<string> {
  const out = new Set<string>()
  for (const c of conflicts) for (const d of eachDay(c.days.start, c.days.end)) out.add(d)
  return out
}
