// Datums van de materiaalplanner. Alles is een hele dag als 'YYYY-MM-DD'.
//
// Bewust zonder uren: de oude planner rekende met ophaal- en terugbrengtijden
// en verschoof daardoor een uur rond de zomer-/wintertijd. Een kale datum kan
// niet verschuiven. Rekenen gebeurt in UTC-middernacht, zodat er nergens een
// lokale tijdzone tussenkomt.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Is dit een bestaande kalenderdag in de vorm YYYY-MM-DD? */
export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUTC(d)
}

/** Aantal dagen van a tot b; 0 als ze gelijk zijn, negatief als b vóór a ligt. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000)
}

/** Alle dagen van start tot en met end. Leeg als end vóór start ligt. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Zaterdag of zondag. */
export function isWeekend(iso: string): boolean {
  const day = toUTC(iso).getUTCDay()
  return day === 0 || day === 6
}

/** Alle dagen van een maand; month loopt van 1 tot 12. */
export function monthDays(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const last  = fromUTC(new Date(Date.UTC(year, month, 0)))
  return eachDay(first, last)
}

/** Vandaag als YYYY-MM-DD in Brussel, ongeacht waar de code draait. */
export function todayInBrussels(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })
}
