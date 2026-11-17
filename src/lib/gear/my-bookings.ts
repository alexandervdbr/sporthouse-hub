import { bookingSlot } from './times'
import type { GearBooking, GearCatalog } from './types'

// "Mijn boekingen": de lijst van boekingen voor mij of door mij gemaakt,
// in drie groepen op basis van het moment nu (Brusselse kloktijd).

export type MyGroup = 'nu' | 'binnenkort' | 'voorbij'

/** Nu, als 'YYYY-MM-DDTHH:MM' in Brussel (zoals de bezetting in times.ts). */
export function nowInBrussels(now: Date = new Date()): string {
  const day = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}T${time}`
}

const slotOf = (b: GearBooking) => bookingSlot(b.start_date, b.start_time, b.end_date, b.end_time)

export function groupOf(b: GearBooking, now: string): MyGroup {
  const s = slotOf(b)
  if (s.end <= now) return 'voorbij'
  return s.start <= now ? 'nu' : 'binnenkort'
}

/**
 * De drie groepen: nu en binnenkort op volgorde van ophalen, voorbij met het
 * recentste bovenaan.
 */
export function groupMyBookings(bookings: GearBooking[], now: string): Record<MyGroup, GearBooking[]> {
  const out: Record<MyGroup, GearBooking[]> = { nu: [], binnenkort: [], voorbij: [] }
  for (const b of bookings) out[groupOf(b, now)].push(b)
  const asc = (a: GearBooking, b: GearBooking) => slotOf(a).start.localeCompare(slotOf(b).start)
  out.nu.sort((a, b) => slotOf(a).end.localeCompare(slotOf(b).end))
  out.binnenkort.sort(asc)
  out.voorbij.sort((a, b) => slotOf(b).end.localeCompare(slotOf(a).end))
  return out
}

/** Mijn boeking: voor mij geboekt of door mij gemaakt. */
export function isMine(b: Pick<GearBooking, 'created_by' | 'booked_for_user_id'>, userId: string): boolean {
  return b.created_by === userId || b.booked_for_user_id === userId
}

/** Wat er geboekt is, als namen: eerst de kits, dan de losse items. */
export function bookingWhat(b: Pick<GearBooking, 'lines'>, catalog: Pick<GearCatalog, 'items' | 'kits'> | null): string[] {
  const kitName = new Map((catalog?.kits ?? []).map(k => [k.id, k.name]))
  const itemName = new Map((catalog?.items ?? []).map(i => [i.id, i.name]))
  const kits: string[] = []
  const seen = new Set<string>()
  for (const l of b.lines) {
    if (!l.via_kit_id || seen.has(l.via_kit_id)) continue
    seen.add(l.via_kit_id)
    kits.push(kitName.get(l.via_kit_id) ?? l.via_kit_name ?? 'Kit')
  }
  const loose = b.lines.filter(l => !l.via_kit_id).map(l => itemName.get(l.item_id) ?? 'Item')
  return [...kits, ...loose]
}

/** Zoeken in "Alle boekingen": persoon, klant, project, notitie, maker of materiaal. */
export function matchesSearch(b: GearBooking, q: string, what: string[]): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [b.person_name, b.external_name, b.client?.name, b.project?.name, b.note, b.created_by_name, ...what]
    .some(x => (x ?? '').toLowerCase().includes(s))
}

// ── Compacte lijst ──────────────────────────────────────────────────────────

/** Filter bovenaan: standaard lopend + gepland samen; of één van de drie. */
export type MyFilter = 'komend' | 'lopend' | 'gepland' | 'afgelopen'
export const FILTER_GROUPS: Record<MyFilter, MyGroup[]> = {
  komend: ['nu', 'binnenkort'], lopend: ['nu'], gepland: ['binnenkort'], afgelopen: ['voorbij'],
}
/** Kopjes in de lijst: correct Nederlands, zonder "mij" (ook in Alle boekingen). */
export const GROUP_HEADING: Record<MyGroup, string> = { nu: 'Lopend', binnenkort: 'Gepland', voorbij: 'Afgelopen' }

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

function addDay(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "Vandaag", "Morgen", "Gisteren", anders "17 nov". */
export function dayWord(iso: string, today: string): string {
  if (iso === today) return 'Vandaag'
  if (iso === addDay(today, 1)) return 'Morgen'
  if (iso === addDay(today, -1)) return 'Gisteren'
  return dm(iso)
}

/**
 * De periode kort: "Vandaag 09:00 → 22:45", "Morgen", "17–20 nov",
 * "28 nov – 2 dec", "Vandaag 14:00 → 20 nov 10:00", "Morgen vanaf 09:00".
 */
export function shortPeriod(b: Pick<GearBooking, 'start_date' | 'end_date' | 'start_time' | 'end_time'>, today: string): string {
  const st = b.start_time ?? null, et = b.end_time ?? null
  const s = dayWord(b.start_date, today), e = dayWord(b.end_date, today)
  if (b.start_date === b.end_date) {
    if (st && et) return `${s} ${st} → ${et}`
    if (st) return `${s} vanaf ${st}`
    if (et) return `${s} tot ${et}`
    return s
  }
  if (st || et) return `${s}${st ? ` ${st}` : ''} → ${e}${et ? ` ${et}` : ''}`
  const words = (x: string) => /^[A-Z]/.test(x)
  if (!words(s) && !words(e) && b.start_date.slice(0, 7) === b.end_date.slice(0, 7)) {
    return `${Number(b.start_date.slice(8, 10))}–${dm(b.end_date)}`
  }
  return words(s) || words(e) ? `${s} → ${e}` : `${s} – ${e}`
}

/** "FX3 A-kit, Sony 70-200mm +3"; de volledige lijst voor de tooltip. */
export function materialShort(names: string[], max = 2): { short: string; full: string } {
  const full = names.join(', ')
  if (names.length <= max) return { short: full || 'Geen materiaal', full }
  return { short: `${names.slice(0, max).join(', ')} +${names.length - max}`, full }
}

export interface PersonGroup<T> {
  key: string
  label: string
  bookings: T[]
}

/**
 * Alle boekingen per persoon, de groepen op volgorde van hun eerste periode
 * (in de getoonde lijst: de vroegste eerst; bij Afgelopen de recentste eerst).
 */
export function groupByPerson<T extends GearBooking>(bookings: T[], holder: (b: T) => { key: string; label: string }, newestFirst = false): PersonGroup<T>[] {
  const m = new Map<string, PersonGroup<T>>()
  for (const b of bookings) {
    const h = holder(b)
    const g = m.get(h.key) ?? { key: h.key, label: h.label, bookings: [] }
    g.bookings.push(b)
    m.set(h.key, g)
  }
  const first = (g: PersonGroup<T>) => g.bookings.map(b => slotOf(b).start).sort()[0] ?? ''
  const last = (g: PersonGroup<T>) => g.bookings.map(b => slotOf(b).end).sort().at(-1) ?? ''
  return [...m.values()].sort((a, b) => newestFirst
    ? last(b).localeCompare(last(a)) || a.label.localeCompare(b.label)
    : first(a).localeCompare(first(b)) || a.label.localeCompare(b.label))
}

/**
 * Binnen één persoon: boekingen met exact dezelfde periode (data en uren),
 * per periode, alleen als het er twee of meer zijn. De grootste eerst.
 */
export function samePeriodClusters<T extends GearBooking>(bookings: T[]): T[][] {
  const m = new Map<string, T[]>()
  for (const b of bookings) {
    const k = `${b.start_date}|${b.start_time ?? ''}|${b.end_date}|${b.end_time ?? ''}`
    m.set(k, [...(m.get(k) ?? []), b])
  }
  return [...m.values()].filter(c => c.length > 1).sort((a, b) => b.length - a.length)
}
