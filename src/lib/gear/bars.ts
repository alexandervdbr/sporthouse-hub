import { diffDays } from './dates'
import { intersectRanges, type DateRange } from './ranges'
import { dayFraction, type Slot } from './times'

// Boekingen van één unit omzetten naar balken in een zichtbaar venster (een
// maand). Het raster tekent alleen; welke dagen, hoe breed en of een balk
// doorloopt buiten beeld, staat hier. Zo kan het raster later van richting
// wisselen zonder dat dit verandert.

export interface BarInput {
  bookingId: string
  range: DateRange
  cancelled: boolean
  /** Met uren (0085): de balk begint en eindigt dan midden in een dag. */
  slot?: Slot
}

export interface Bar {
  bookingId: string
  /** Kolom van de eerste zichtbare dag, 0 = eerste dag van het venster. */
  startIndex: number
  /** Aantal zichtbare dagen. */
  span: number
  /** Begon al vóór het venster: geen afgeronde linkerkant tekenen. */
  continuesBefore: boolean
  /** Loopt door na het venster. */
  continuesAfter: boolean
  /** Waar de balk in zijn eerste zichtbare dag begint (0 = middernacht). */
  startFrac: number
  /** Waar de balk in zijn laatste zichtbare dag eindigt (1 = middernacht erna). */
  endFrac: number
}

export function buildBars(bookings: BarInput[], window: DateRange): Bar[] {
  const bars: Bar[] = []
  for (const b of bookings) {
    if (b.cancelled) continue
    const visible = intersectRanges(b.range, window)
    if (!visible) continue
    bars.push({
      bookingId: b.bookingId,
      startIndex: diffDays(window.start, visible.start),
      span: diffDays(visible.start, visible.end) + 1,
      continuesBefore: b.range.start < window.start,
      continuesAfter: b.range.end > window.end,
      startFrac: b.slot ? dayFraction(b.slot.start, visible.start) : 0,
      endFrac: b.slot ? dayFraction(b.slot.end, visible.end) : 1,
    })
  }
  return bars.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Een sleep in het raster van kolom a naar kolom b (in welke richting ook)
 * als periode. `days` zijn de dagen van het venster, in volgorde.
 */
export function rangeFromSelection(days: string[], a: number, b: number): DateRange | null {
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(days.length - 1, Math.max(a, b))
  if (days.length === 0 || lo > hi) return null
  return { start: days[lo], end: days[hi] }
}
