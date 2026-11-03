import { diffDays } from './dates'
import { intersectRanges, type DateRange } from './ranges'

// Boekingen van één unit omzetten naar balken in een zichtbaar venster (een
// maand). Het raster tekent alleen; welke dagen, hoe breed en of een balk
// doorloopt buiten beeld, staat hier. Zo kan het raster later van richting
// wisselen zonder dat dit verandert.

export interface BarInput {
  bookingId: string
  range: DateRange
  cancelled: boolean
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
