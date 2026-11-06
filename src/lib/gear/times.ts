import { addDays, eachDay } from './dates'

// Ophaal- en terugbrenguren (0085). Alles is Brusselse kloktijd als tekst:
// een moment is 'YYYY-MM-DDTHH:MM', een uur 'HH:MM'. Nergens een Date, nergens
// UTC: zo kan niets verschuiven rond de zomer-/wintertijd, en tekst in deze
// vorm sorteert en vergelijkt zoals de tijd zelf.
//
// Een bezetting (Slot) is half open, [begin, einde): terugbrengen om 10:00 en
// ophalen om 10:00 dezelfde dag botst niet. Zonder uur is het de hele dag:
// ophalen vanaf 00:00, terugbrengen tot 00:00 de dag erna. Zelf kiezen kan
// per kwartier van 06:00 tot 23:45 — het nachtuur van de wisseldagen valt
// daar buiten.

export interface Slot {
  start: string
  end: string
}

export const FIRST_TIME = '06:00'
export const LAST_TIME = '23:45'

/** 06:00, 06:15, … 23:45. */
export const TIME_OPTIONS: string[] = Array.from({ length: (24 - 6) * 4 }, (_, i) => {
  const m = 6 * 60 + i * 15
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** 'HH:MM' uit wat de database geeft ('10:00:00'), of null. */
export function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null
  const hm = t.slice(0, 5)
  return TIME_RE.test(hm) ? hm : null
}

/** Een uur dat je kan kiezen: per kwartier, 06:00–23:45. */
export function isValidTime(t: string | null | undefined): boolean {
  return t === null || t === undefined || t === '' || TIME_OPTIONS.includes(t)
}

/** De bezetting van een boeking: [ophalen, terugbrengen). */
export function bookingSlot(startDate: string, startTime: string | null | undefined, endDate: string, endTime: string | null | undefined): Slot {
  return {
    start: `${startDate}T${normalizeTime(startTime) ?? '00:00'}`,
    end: normalizeTime(endTime) ? `${endDate}T${normalizeTime(endTime)}` : `${addDays(endDate, 1)}T00:00`,
  }
}

/** Een hele dag. */
export function daySlot(day: string): Slot {
  return { start: `${day}T00:00`, end: `${addDays(day, 1)}T00:00` }
}

export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a.start < b.end && b.start < a.end
}

export function isEmptySlot(s: Slot): boolean {
  return s.start >= s.end
}

const dayOf = (m: string) => m.slice(0, 10)
const timeOf = (m: string) => m.slice(11, 16)

/** Hoe ver in de dag (0 = middernacht, 1 = de middernacht erna), voor de balken. */
export function dayFraction(moment: string, day: string): number {
  if (moment <= `${day}T00:00`) return 0
  if (moment >= `${addDays(day, 1)}T00:00`) return 1
  const [h, m] = timeOf(moment).split(':').map(Number)
  return (h * 60 + m) / 1440
}

/** De vrije stukken van één dag, gegeven de bezettingen. */
export function freeGaps(day: string, busy: Slot[]): Slot[] {
  const whole = daySlot(day)
  const taken = busy.filter(s => slotsOverlap(s, whole)).sort((a, b) => a.start.localeCompare(b.start))
  const out: Slot[] = []
  let cursor = whole.start
  for (const s of taken) {
    if (s.start > cursor) out.push({ start: cursor, end: s.start < whole.end ? s.start : whole.end })
    if (s.end > cursor) cursor = s.end
    if (cursor >= whole.end) break
  }
  if (cursor < whole.end) out.push({ start: cursor, end: whole.end })
  return out
}

/** Is de hele dag bezet? Dan kan je er niet meer op klikken. */
export function dayFullyBusy(day: string, busy: Slot[]): boolean {
  return freeGaps(day, busy).length === 0
}

/**
 * Een moment als uur in het formulier: null voor middernacht (= hele dag),
 * of het uur. Een uur buiten 06:00–23:45 kan je niet kiezen: dan undefined.
 */
function asStartTime(moment: string, day: string): string | null | undefined {
  if (moment === `${day}T00:00`) return null
  const t = timeOf(moment)
  return dayOf(moment) === day && isValidTime(t) ? t : undefined
}
function asEndTime(moment: string, day: string): string | null | undefined {
  if (moment === `${addDays(day, 1)}T00:00`) return null
  const t = timeOf(moment)
  return dayOf(moment) === day && isValidTime(t) ? t : undefined
}

export interface Suggestion {
  startTime: string | null
  endTime: string | null
  /** Bezettingen die ook met deze uren nog in de weg zitten; leeg = alles vrij. */
  conflicts: Slot[]
}

/**
 * Uren voorstellen voor een klik of een sleep over de dagen `from`–`to`:
 * - één dag: het eerste vrije stuk van die dag ("tot 10:00 weg" → ophalen 10:00);
 * - meerdere dagen: ophalen na wat op de eerste dag eindigt, terugbrengen
 *   vóór wat op de laatste dag begint.
 * Wat dan nog botst (iets midden in de periode), staat in `conflicts`, zodat
 * het formulier precies kan zeggen welk deel niet kan.
 */
export function suggestTimes(from: string, to: string, busy: Slot[]): Suggestion {
  if (from === to) {
    const gap = freeGaps(from, busy)[0]
    if (gap) {
      const s = asStartTime(gap.start, from), e = asEndTime(gap.end, from)
      if (s !== undefined && e !== undefined) return { startTime: s, endTime: e, conflicts: [] }
    }
    return { startTime: null, endTime: null, conflicts: busy.filter(b => slotsOverlap(b, daySlot(from))) }
  }

  let start = `${from}T00:00`
  for (const b of busy) {
    // Wat op de eerste dag eindigt: daarna ophalen.
    if (b.end > start && dayOf(b.end) === from && b.end > `${from}T00:00`) start = b.end
  }
  let end = `${addDays(to, 1)}T00:00`
  for (const b of busy) {
    // Wat op de laatste dag begint: daarvóór terugbrengen.
    if (b.start < end && dayOf(b.start) === to && b.start >= start) end = b.start
  }
  let startTime = asStartTime(start, from), endTime = asEndTime(end, to)
  if (startTime === undefined) { startTime = null; start = `${from}T00:00` }
  if (endTime === undefined) { endTime = null; end = `${addDays(to, 1)}T00:00` }
  const slot = { start, end }
  return { startTime, endTime, conflicts: isEmptySlot(slot) ? busy : busy.filter(b => slotsOverlap(b, slot)) }
}

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}`

/**
 * Een bezetting leesbaar, bekeken vanaf één dag (de dagweergave) of als
 * geheel: "tot 10:00", "vanaf 14:00", "10:00–14:00", "hele dag", of over
 * meerdere dagen "5 nov 14:00 – 7 nov 10:00".
 */
export function slotLabel(s: Slot, day?: string): string {
  const startDay = dayOf(s.start), lastDay = timeOf(s.end) === '00:00' ? addDays(dayOf(s.end), -1) : dayOf(s.end)
  const st = timeOf(s.start), et = timeOf(s.end)
  if (day) {
    const fromHere = startDay === day && st !== '00:00'
    const tillHere = lastDay === day && et !== '00:00'
    if (fromHere && tillHere) return `${st}–${et}`
    if (fromHere) return `vanaf ${st}`
    if (tillHere) return `tot ${et}`
    return 'hele dag'
  }
  const a = `${shortDay(startDay)}${st !== '00:00' ? ` ${st}` : ''}`
  const b = `${shortDay(lastDay)}${et !== '00:00' ? ` ${et}` : ''}`
  if (startDay === lastDay) {
    if (st === '00:00' && et === '00:00') return shortDay(startDay)
    if (st === '00:00') return `${shortDay(startDay)} tot ${et}`
    if (et === '00:00') return `${shortDay(startDay)} vanaf ${st}`
    return `${shortDay(startDay)} ${st}–${et}`
  }
  return `${a} – ${b}`
}

/** De dagen die een bezetting raakt (voor de dagchips). */
export function slotDays(s: Slot): string[] {
  const last = timeOf(s.end) === '00:00' ? addDays(dayOf(s.end), -1) : dayOf(s.end)
  return eachDay(dayOf(s.start), last)
}

/** Een vrij stuk van één dag als uren voor het formulier ("vrij 10:00–14:00" → 10:00 en 14:00). */
export function gapTimes(gap: Slot, day: string): { startTime: string | null; endTime: string | null } {
  const s = asStartTime(gap.start, day), e = asEndTime(gap.end, day)
  return { startTime: s ?? null, endTime: e ?? null }
}
