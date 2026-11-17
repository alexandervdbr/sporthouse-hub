import { bookingSlot } from './times'
import type { GearBooking, GearCatalog } from './types'

// "Mijn boekingen": de lijst van boekingen voor mij of door mij gemaakt,
// in drie groepen op basis van het moment nu (Brusselse kloktijd).

export type MyGroup = 'nu' | 'binnenkort' | 'voorbij'

export const MY_GROUP_LABEL: Record<MyGroup, string> = { nu: 'Nu bij mij', binnenkort: 'Binnenkort', voorbij: 'Voorbij' }

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
