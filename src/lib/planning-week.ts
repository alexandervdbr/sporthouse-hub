import { DUTCH_DAYS, DUTCH_MONTHS } from '@/lib/planning-config'

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
}

export type PlanningWeekData = Record<string, CellData>

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
export function dateCellKey(year: number, month: number, day: number, dept: string, emp: string) {
  return `${year}-${month}-${day}|${dept}|${emp}`
}

export function weekDayCellKey(wd: WeekDay, dept: string, emp: string) {
  return dateCellKey(wd.year, wd.month, wd.day, dept, emp)
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
