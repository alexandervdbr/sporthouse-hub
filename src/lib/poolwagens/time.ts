// Tijdstippen van de poolwagens. Anders dan de materiaalplanner (hele dagen)
// heeft een rit een uur: vertrek om 08:30, terug om 17:00. In de database is
// dat timestamptz; in formulieren een Brusselse kloktijd ('YYYY-MM-DDTHH:mm',
// zoals <input type="datetime-local"> die geeft). Omzetten gebeurt hier, op
// de server en in de browser op dezelfde manier, zodat de tijdzone van de
// machine nooit meespeelt — ook niet rond de zomer- en wintertijd.

const ZONE = 'Europe/Brussels'
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** De Brusselse kloktijd van een tijdstip, als getallen. */
function brusselsParts(instant: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(instant).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** Hoeveel minuten Brussel op dat moment voor ligt op UTC (60 of 120). */
function offsetMinutes(instant: Date): number {
  const p = brusselsParts(instant)
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return Math.round((asUTC - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * Brusselse kloktijd → tijdstip (ISO, UTC), of null als de invoer geen
 * geldige kloktijd is. Een uur dat bij de zomertijd overgeslagen wordt
 * (02:30 op de laatste zondag van maart) schuift naar het eerstvolgende
 * bestaande moment.
 */
export function brusselsLocalToISO(local: string): string | null {
  const m = LOCAL_RE.exec(local)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const check = new Date(wall)
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return null
  // Twee keer: de verschuiving hangt af van het tijdstip dat we zoeken.
  let guess = wall - offsetMinutes(new Date(wall)) * 60_000
  guess = wall - offsetMinutes(new Date(guess)) * 60_000
  return new Date(guess).toISOString()
}

/** Tijdstip → Brusselse kloktijd 'YYYY-MM-DDTHH:mm' (voor formulieren). */
export function isoToBrusselsLocal(iso: string | Date): string {
  const p = brusselsParts(typeof iso === 'string' ? new Date(iso) : iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${two(p.m)}-${two(p.d)}T${two(p.h)}:${two(p.mi)}`
}

/** De Brusselse kalenderdag van een tijdstip, 'YYYY-MM-DD'. */
export function brusselsDay(iso: string | Date): string {
  return isoToBrusselsLocal(iso).slice(0, 10)
}

/** Middernacht in Brussel aan het begin van die dag, als tijdstip. */
export function brusselsDayStartISO(day: string): string {
  return brusselsLocalToISO(`${day}T00:00`)!
}

/** Kort, voor balken en lijsten: "di 4/11 14:30". */
export function formatShort(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('nl-BE', { timeZone: ZONE, weekday: 'short', day: 'numeric', month: 'numeric' })
  const time = d.toLocaleTimeString('nl-BE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

/** Alleen het uur: "14:30". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-BE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' })
}

/** Een periode leesbaar: zelfde dag "di 4/11 08:00–17:00", anders beide volledig. */
export function formatPeriod(startISO: string, endISO: string): string {
  return brusselsDay(startISO) === brusselsDay(endISO)
    ? `${formatShort(startISO)}–${formatTime(endISO)}`
    : `${formatShort(startISO)} – ${formatShort(endISO)}`
}

/**
 * Overlappen twee periodes? Halfopen, zoals de database ([start, einde)):
 * wie om 12:00 terug is, botst niet met wie om 12:00 vertrekt.
 */
export function periodsOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)
}
