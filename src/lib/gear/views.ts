import { addDays, diffDays, isISODate, monthDays, weekdayIndex } from './dates'
import type { DateRange } from './ranges'

// De drie weergaven van de planner: één dag, één week (maandag tot zondag) of
// één maand. Elke weergave heeft een ankerdatum; de pijlen schuiven die per
// dag, week of maand op, en de planner laadt alleen de zichtbare periode.
// Namen staan hier vast in het Nederlands, zodat ze niet afhangen van de
// taalinstelling van de browser.

export const PLANNER_VIEWS = ['day', 'week', 'month'] as const
export type PlannerView = typeof PLANNER_VIEWS[number]

export const PLANNER_VIEW_LABEL: Record<PlannerView, string> = { day: 'Dag', week: 'Week', month: 'Maand' }
export const DEFAULT_VIEW: PlannerView = 'week'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) })

export function isPlannerView(value: unknown): value is PlannerView {
  return typeof value === 'string' && (PLANNER_VIEWS as readonly string[]).includes(value)
}

/** De maandag van de week waarin iso valt. */
export function weekStart(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/** ISO-weeknummer (week 1 is de week met de eerste donderdag van het jaar). */
export function isoWeek(iso: string): number {
  const thursday = addDays(weekStart(iso), 3)
  const firstThursdayWeek = weekStart(`${thursday.slice(0, 4)}-01-04`)
  return diffDays(firstThursdayWeek, weekStart(iso)) / 7 + 1
}

/** De zichtbare dagen van een weergave rond de ankerdatum. */
export function viewRange(view: PlannerView, date: string): DateRange {
  if (view === 'day') return { start: date, end: date }
  if (view === 'week') { const start = weekStart(date); return { start, end: addDays(start, 6) } }
  const { y, m } = parts(date)
  const days = monthDays(y, m)
  return { start: days[0], end: days[days.length - 1] }
}

/**
 * Een stap terug of vooruit. Bij een maand blijft de dag van de maand staan,
 * tenzij die niet bestaat (31 januari → 28 februari).
 */
export function shiftView(view: PlannerView, date: string, delta: number): string {
  if (view === 'day') return addDays(date, delta)
  if (view === 'week') return addDays(date, delta * 7)
  const { y, m, d } = parts(date)
  const index = y * 12 + (m - 1) + delta
  const ny = Math.floor(index / 12), nm = index - ny * 12 + 1
  const last = monthDays(ny, nm).length
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** "3–7 nov", "28 okt – 2 nov", "30 dec 2026 – 2 jan 2027"; één dag: "5 nov". */
export function periodLabel(start: string, end: string, withYear = false): string {
  const a = parts(start), b = parts(end)
  const sameYear = a.y === b.y
  const yearB = withYear || !sameYear ? ` ${b.y}` : ''
  if (start === end) return `${a.d} ${MONTHS_SHORT[a.m - 1]}${yearB}`
  if (sameYear && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]}${yearB}`
  return `${a.d} ${MONTHS_SHORT[a.m - 1]}${sameYear ? '' : ` ${a.y}`} – ${b.d} ${MONTHS_SHORT[b.m - 1]}${yearB}`
}

/** "Do 5 november 2026" · "Week 45 · 2–8 nov 2026" · "November 2026". */
export function viewLabel(view: PlannerView, date: string): string {
  const { y, m, d } = parts(date)
  if (view === 'day') return `${WEEKDAYS[weekdayIndex(date)]} ${d} ${MONTHS[m - 1]} ${y}`
  if (view === 'week') { const r = viewRange('week', date); return `Week ${isoWeek(date)} · ${periodLabel(r.start, r.end, true)}` }
  return `${cap(MONTHS[m - 1])} ${y}`
}

/** Valt vandaag in de zichtbare periode? Dan is "Vandaag" overbodig. */
export function showsToday(view: PlannerView, date: string, today: string): boolean {
  const r = viewRange(view, date)
  return r.start <= today && today <= r.end
}

/**
 * Weergave en datum uit de URL (?view=week&date=2026-11-05). Ontbreekt of
 * klopt iets niet, dan de terugval: de laatst gekozen weergave en vandaag.
 */
export function parseViewParams(
  params: { view?: string | null; date?: string | null },
  fallbackView: PlannerView,
  today: string,
): { view: PlannerView; date: string } {
  return {
    view: isPlannerView(params.view) ? params.view : fallbackView,
    date: params.date && isISODate(params.date) ? params.date : today,
  }
}
