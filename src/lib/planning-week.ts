import { DUTCH_DAYS, DUTCH_MONTHS } from '@/lib/planning-config'
import type { PlanningRow } from '@/lib/planning-cache'

// De namiddag van een halve dag. Zie CellData.pm.
export interface HalfCell {
  value:     string
  textColor: string | null
  bgColor:   string | null
}

export interface CellData {
  value:     string
  bold:      boolean
  textColor: string | null
  bgColor:   string | null
  // Kept separate from `value` on purpose — every day with the same status
  // ("PS", "SHG", …) should look identical (same pill, same color), with
  // any specifics (a client, a time, a reason) shown as a secondary note
  // instead of becoming a one-off status of its own.
  note: string | null
  // Halve dag: dan zijn value/textColor/bgColor de voormiddag en dit de
  // namiddag. Leeg (of afwezig) = één status voor de hele dag, zoals altijd.
  // De notitie blijft één veld voor de hele dag.
  pm?: HalfCell | null
  // Who touched this cell last, and when — set on every write (see
  // PlanningApp's writeEntries). Absent on rows written before this existed,
  // and never populated on a freshly-opened empty cell, so its presence
  // alone means "this is a real, previously-saved single cell."
  updatedBy?: string | null
  updatedAt?: string | null
}

export type PlanningWeekData = Record<string, CellData>

// Eén cel om te schrijven: een dag en de persoon van wie die dag is. Gedeeld
// door alle rasters, zodat ze het niet elk net anders vormgeven.
export interface Target {
  wd: WeekDay
  contactId: string
}

export function emptyCell(): CellData {
  return { value: '', bold: true, textColor: '#ffffff', bgColor: null, note: null }
}

export interface WeekDay {
  date: Date
  year: number
  month: number // 1-12
  day: number
  dayName: string
  isWeekend: boolean
  isToday: boolean
}

// Monday-first, matching the rest of the app's weekday convention.
function mondayOf(d: Date): Date {
  const dow = d.getDay() // 0=Sun..6=Sat
  const diff = (dow + 6) % 7 // days since Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
}

// A week can span two months (or years) — each day carries its own
// year/month/day rather than assuming one shared month for the whole week,
// since planning_entries is keyed per-day, not per-week.
export function getWeekDates(anchor: Date): WeekDay[] {
  const monday = mondayOf(anchor)
  const today = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    const dow = d.getDay()
    return {
      date: d,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      dayName: DUTCH_DAYS[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: d.getFullYear() === today.getFullYear()
        && d.getMonth() === today.getMonth()
        && d.getDate() === today.getDate(),
    }
  })
}

export function addWeeks(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta * 7)
}

export function addDays(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta)
}

// Day fixed at 1 to avoid native Date overflow when the current day doesn't
// exist in the target month (e.g. Jan 31 + 1 month silently becoming Mar 3).
export function addMonths(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
}

// A single day, independent of any week grouping — used by the mobile Team
// day-stepper, which steps one day at a time rather than jumping by week.
export function dayInfo(date: Date): WeekDay {
  const today = new Date()
  const dow = date.getDay()
  return {
    date,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dayName: DUTCH_DAYS[dow],
    isWeekend: dow === 0 || dow === 6,
    isToday: date.toDateString() === today.toDateString(),
  }
}

// Cell identity includes year+month (unlike the old month-grid's cellKey)
// because a week's 7 days aren't guaranteed to share either.
//
// Op contact-id, niet op (afdeling, naam): een dag hangt aan een persoon. Zie
// supabase/migrations/0053_planning_op_contact_id.sql.
export function dateCellKey(year: number, month: number, day: number, contactId: string) {
  return `${year}-${month}-${day}|${contactId}`
}

export function weekDayCellKey(wd: WeekDay, contactId: string) {
  return dateCellKey(wd.year, wd.month, wd.day, contactId)
}

export function weekLabel(week: WeekDay[]): string {
  const first = week[0]
  const last = week[6]
  const shortDate = (w: WeekDay) => `${w.day} ${DUTCH_MONTHS[w.month - 1].slice(0, 3)}`
  if (first.year === last.year && first.month === last.month) {
    return `${first.day} – ${shortDate(last)} ${last.year}`
  }
  if (first.year === last.year) {
    return `${shortDate(first)} – ${shortDate(last)} ${last.year}`
  }
  return `${shortDate(first)} ${first.year} – ${shortDate(last)} ${last.year}`
}

// Full calendar weeks (Monday-first) covering a whole month, including the
// leading/trailing days of neighboring months needed to complete the first
// and last week — used by "Mijn maand", which renders the month as full
// week-rows stacked on top of each other rather than a day-only grid.
export function getMonthWeeks(year: number, month: number): WeekDay[][] {
  const lastOfMonth = new Date(year, month - 1, new Date(year, month, 0).getDate())
  const weeks: WeekDay[][] = []
  let anchor = new Date(year, month - 1, 1)
  while (true) {
    const week = getWeekDates(anchor)
    weeks.push(week)
    if (week[6].date >= lastOfMonth) break
    anchor = addWeeks(anchor, 1)
  }
  return weeks
}

// Groups a week's 7 days by (year, month) — usually one group, occasionally
// two at a month/year boundary — so the caller can issue one Supabase query
// per group instead of needing a single composite-key IN() query.
export function groupWeekByMonth(week: WeekDay[]): { year: number; month: number; days: number[] }[] {
  const groups = new Map<string, { year: number; month: number; days: number[] }>()
  for (const wd of week) {
    const key = `${wd.year}-${wd.month}`
    const group = groups.get(key)
    if (group) group.days.push(wd.day)
    else groups.set(key, { year: wd.year, month: wd.month, days: [wd.day] })
  }
  return [...groups.values()]
}

// Cellen om te wissen, gegroepeerd per (jaar, maand, persoon), zodat elke
// groep één DELETE wordt met `day IN (...)`.
//
// Wissen ging per cel: een maand leegmaken voor één persoon waren dertig
// losse verzoeken, en dat is precies het soort herhaling dat in oktober de
// quota liet overlopen (zie CLAUDE.md). Zo is het er één.
export interface DeleteGroup {
  year: number
  month: number
  contactId: string
  days: number[]
}

export function groupDeletes(cells: { year: number; month: number; day: number; contactId: string }[]): DeleteGroup[] {
  const groups = new Map<string, DeleteGroup>()
  for (const c of cells) {
    const key = `${c.year}-${c.month}|${c.contactId}`
    const group = groups.get(key)
    if (group) {
      if (!group.days.includes(c.day)) group.days.push(c.day)
    } else {
      groups.set(key, { year: c.year, month: c.month, contactId: c.contactId, days: [c.day] })
    }
  }
  return [...groups.values()]
}

// ── Van rij naar cel en terug ────────────────────────────────────────────────
//
// Eén plek voor de vertaling, want ze stond op vijf plaatsen (volledig laden,
// sync, realtime, schrijven, de link) en een nieuwe kolom moest dan vijf keer
// mee — en werd een keer vergeten.

export function rowToCell(r: PlanningRow): CellData {
  const pmValue = r.value_pm?.trim() ? r.value_pm : null
  return {
    value: r.value, bold: r.bold ?? true,
    textColor: r.text_color ?? '#ffffff', bgColor: r.bg_color ?? null,
    note: r.note ?? null,
    pm: pmValue
      ? { value: pmValue, textColor: r.text_color_pm ?? '#ffffff', bgColor: r.bg_color_pm ?? null }
      : null,
    updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null,
  }
}

// De kolommen die een cel vult. Een hele dag zet de namiddag expliciet op
// null, zodat een dag die eerst gesplitst was ook echt weer heel wordt.
export function cellToRowFields(cell: CellData) {
  const pm = isHalfDay(cell) ? cell.pm! : null
  return {
    value: cell.value, bold: cell.bold,
    text_color: cell.textColor, bg_color: cell.bgColor, note: cell.note,
    value_pm: pm?.value ?? null,
    text_color_pm: pm?.textColor ?? null,
    bg_color_pm: pm?.bgColor ?? null,
  }
}

export function isHalfDay(cell: CellData | null | undefined): boolean {
  return !!cell?.pm && cell.pm.value.trim() !== ''
}

// De helften om te tekenen: één voor een hele dag, twee voor een halve.
export function cellHalves(cell: CellData): HalfCell[] {
  const vm: HalfCell = { value: cell.value, textColor: cell.textColor, bgColor: cell.bgColor }
  return isHalfDay(cell) ? [vm, cell.pm!] : [vm]
}

// Als tekst: "PS" of "VM Recup · NM PS". Voor tooltips, de link en de AI.
export function cellLabel(cell: CellData): string {
  return isHalfDay(cell) ? `VM ${cell.value} · NM ${cell.pm!.value}` : cell.value
}

// Hoeveel van een dag elke status is: een hele dag telt 1, elke helft van een
// halve dag 0,5. Voormiddag en namiddag met dezelfde status samen weer 1.
export function dayParts(value: string, valuePm: string | null | undefined): { value: string; weight: number }[] {
  if (!valuePm?.trim()) return [{ value, weight: 1 }]
  if (valuePm === value) return [{ value, weight: 1 }]
  return [{ value, weight: 0.5 }, { value: valuePm, weight: 0.5 }]
}

// Een aantal dagen zoals het in de statistieken staat: "3", "2,5".
export function formatDays(n: number): string {
  return n.toLocaleString('nl-BE', { maximumFractionDigits: 1 })
}
