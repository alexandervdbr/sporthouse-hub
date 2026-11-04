import { addDays, eachDay, isWeekend, monthDays } from '@/lib/gear/dates'
import { addMinutesLocal, brusselsDayStartISO, brusselsLocalToISO, mondayOf, shortDayLabel } from './time'

// De drie weergaven van het planningsraster (Dag, Week, Maand): welk venster,
// welke kolommen, waar "vorige" en "volgende" naartoe gaan, en wat een klik op
// een leeg vak voorstelt. Puur, zodat het zonder browser te testen is.

export type PoolView = 'dag' | 'week' | 'maand'
export const VIEWS: PoolView[] = ['dag', 'week', 'maand']
export const DEFAULT_VIEW: PoolView = 'week'

/** De dagweergave loopt van 07:00 tot 22:00, in vakken van een half uur. */
export const DAY_FROM_HOUR = 7
export const DAY_TO_HOUR = 22
export const DAY_SLOTS = (DAY_TO_HOUR - DAY_FROM_HOUR) * 2

export interface ViewColumn {
  key: string
  /** Bovenste regel (weekdag, of het uur). */
  top: string
  /** Onderste regel (dag van de maand), of leeg. */
  main: string
  today: boolean
  weekend: boolean
  /** In de dagweergave: begint hier een uur (voor de lijnen en labels). */
  hourStart: boolean
}

export interface ViewWindow {
  view: PoolView
  /** De dagen die het venster raakt. */
  days: string[]
  startMs: number
  endMs: number
  columns: ViewColumn[]
  /** Voor de titel: "Week van 3/11", "Woensdag 4/11", "November 2026". */
  title: string
}

const MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
const WEEKDAYS_LONG = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']

const pad = (n: number) => String(n).padStart(2, '0')
const ms = (local: string) => Date.parse(brusselsLocalToISO(local)!)

/** Het begin van een vak in de dagweergave, als kloktijd. */
export function slotLocal(day: string, slot: number): string {
  const minutes = DAY_FROM_HOUR * 60 + slot * 30
  return `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function viewWindow(view: PoolView, anchor: string, today: string): ViewWindow {
  if (view === 'dag') {
    const columns: ViewColumn[] = Array.from({ length: DAY_SLOTS }, (_, i) => ({
      key: `s${i}`,
      top: i % 2 === 0 ? `${DAY_FROM_HOUR + i / 2}` : '',
      main: '',
      today: false,
      weekend: false,
      hourStart: i % 2 === 0,
    }))
    const [y, m, d] = anchor.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return {
      view, days: [anchor], columns,
      startMs: ms(slotLocal(anchor, 0)),
      endMs: ms(`${anchor}T${pad(DAY_TO_HOUR)}:00`),
      title: `${WEEKDAYS_LONG[weekday]} ${d}/${m}`,
    }
  }

  const days = view === 'week'
    ? eachDay(mondayOf(anchor), addDays(mondayOf(anchor), 6))
    : monthDays(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))
  const columns: ViewColumn[] = days.map(day => {
    const label = shortDayLabel(day) // "vr 7/11"
    return {
      key: day,
      top: label.slice(0, 2),
      main: view === 'week' ? label.slice(3) : String(Number(day.slice(8, 10))),
      today: day === today,
      weekend: isWeekend(day),
      hourStart: true,
    }
  })
  return {
    view, days, columns,
    startMs: Date.parse(brusselsDayStartISO(days[0])),
    // Middernacht van de dag erna: ook juist in de week van de wintertijd,
    // waar die zondag 25 uur telt.
    endMs: Date.parse(brusselsDayStartISO(addDays(days[days.length - 1], 1))),
    title: view === 'week'
      ? `Week van ${shortDayLabel(days[0]).slice(3)}`
      : `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`,
  }
}

/** Vorige of volgende in de gekozen weergave. */
export function shiftAnchor(view: PoolView, anchor: string, delta: number): string {
  if (view === 'dag') return addDays(anchor, delta)
  if (view === 'week') return addDays(anchor, 7 * delta)
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7)) - 1 + delta
  const year = y + Math.floor(m / 12), month = ((m % 12) + 12) % 12 + 1
  return `${year}-${pad(month)}-01`
}

/** Ligt vandaag in het venster van deze weergave? */
export function showsToday(view: PoolView, anchor: string, today: string): boolean {
  return viewWindow(view, anchor, today).days.includes(today)
}

/**
 * Een klik of sleep op lege vakken → de periode voor het reserveerformulier
 * (kloktijden). Dag: per half uur. Week en maand: per dag, 09:00–17:00 (zoals
 * de materiaalplanner); vandaag begint bij het volgende hele uur.
 */
export function selectionToPeriod(
  win: ViewWindow, from: number, to: number, nextHour: string, nextHourPlus2: string,
): { start: string; end: string } {
  if (win.view === 'dag') {
    const day = win.days[0]
    return { start: slotLocal(day, from), end: addMinutesLocal(slotLocal(day, to), 30)! }
  }
  const startDay = win.days[from]
  const start = startDay === nextHour.slice(0, 10) && nextHour > `${startDay}T09:00` ? nextHour : `${startDay}T09:00`
  let end = `${win.days[to]}T17:00`
  if (end <= start) end = nextHourPlus2
  return { start, end }
}

/** Is dit vak voorbij (dan kan je er niet op klikken om te reserveren)? */
export function columnIsPast(win: ViewWindow, index: number, now: Date, today: string): boolean {
  if (win.view === 'dag') return ms(addMinutesLocal(slotLocal(win.days[0], index), 30)!) <= now.getTime()
  return win.days[index] < today
}

/** Waar de rode lijn van "nu" staat, in procent van het venster, of null. */
export function nowPercent(win: Pick<ViewWindow, 'startMs' | 'endMs'>, now: Date): number | null {
  const t = now.getTime()
  if (t < win.startMs || t >= win.endMs) return null
  return ((t - win.startMs) / (win.endMs - win.startMs)) * 100
}

// ── De laatst gekozen weergave, per gebruiker ──────────────────────────────
// localStorage kan ontbreken (privémodus, een oude browser) of vol zijn: dan
// gewoon Week.

const viewKey = (userId: string) => `poolwagens:weergave:${userId}`

export function loadView(userId: string): PoolView {
  try {
    const v = window.localStorage.getItem(viewKey(userId))
    return VIEWS.includes(v as PoolView) ? (v as PoolView) : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveView(userId: string, view: PoolView): void {
  try {
    window.localStorage.setItem(viewKey(userId), view)
  } catch {
    // Niet kunnen onthouden is geen fout.
  }
}
