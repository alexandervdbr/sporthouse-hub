import { normalizeTime } from './times'
import { periodLabel } from './views'
import type { GearBooking, GearClientRef } from './types'

// Boekingen samenvoegen (0094): de regels zoals de database ze afdwingt, hier
// zodat het scherm het al zegt vóór iemand klikt.
//
// - minstens twee boekingen;
// - van dezelfde persoon (zelfde collega, freelancer of externe naam; zonder
//   persoon: dezelfde klant);
// - met exact dezelfde periode: data én uren.
//
// Klant en project: verschillen ze, dan kies je welke blijven. Notities
// worden samengevoegd (elke tekst één keer).

type Period = Pick<GearBooking, 'start_date' | 'end_date' | 'start_time' | 'end_time'>
export type MergeBooking = Period & Pick<GearBooking, 'id' | 'booked_for_user_id' | 'freelancer_id' | 'external_name' | 'person_name' | 'client' | 'project' | 'note'>

// Voor wie een boeking is, als sleutel: dezelfde regel als gear_holder_key()
// in de database (0094). Een collega, een freelancer, een externe naam (zonder
// hoofdletters), of zonder persoon de klant.

type Holder = Pick<GearBooking, 'booked_for_user_id' | 'freelancer_id' | 'external_name' | 'person_name' | 'client'>

export function holderOf(b: Holder): { key: string; label: string } {
  const label = b.person_name ?? b.external_name ?? b.client?.name ?? 'onbekend'
  if (b.booked_for_user_id) return { key: `u:${b.booked_for_user_id}`, label }
  if (b.freelancer_id) return { key: `f:${b.freelancer_id}`, label }
  if (b.external_name?.trim()) return { key: `e:${b.external_name.trim().toLowerCase()}`, label }
  if (b.client) return { key: `c:${b.client.id}`, label }
  return { key: `n:${(b.person_name ?? '').trim().toLowerCase()}`, label }
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.start_date === b.start_date && a.end_date === b.end_date
    && normalizeTime(a.start_time) === normalizeTime(b.start_time) && normalizeTime(a.end_time) === normalizeTime(b.end_time)
}

/** "3–5 nov 10:00–18:00", kort, voor de reden waarom het niet kan. */
export function periodText(p: Period): string {
  const st = normalizeTime(p.start_time), et = normalizeTime(p.end_time)
  const times = st || et ? ` ${st ?? '00:00'}–${et ?? '24:00'}` : ''
  return `${periodLabel(p.start_date, p.end_date)}${times}`
}

export type MergeCheck = { ok: true } | { ok: false; reason: string }

/** Mag deze selectie samengevoegd worden? Anders één regel uitleg. */
export function mergeCheck(selected: MergeBooking[]): MergeCheck {
  if (selected.length < 2) return { ok: false, reason: 'Kies minstens twee boekingen.' }
  const [first, ...rest] = selected
  const otherPerson = rest.find(b => holderOf(b).key !== holderOf(first).key)
  if (otherPerson) return { ok: false, reason: `Andere persoon: ${holderOf(otherPerson).label} en ${holderOf(first).label}` }
  const otherPeriod = rest.find(b => !samePeriod(b, first))
  if (otherPeriod) return { ok: false, reason: `Andere periode: ${periodText(otherPeriod)} en ${periodText(first)}` }
  return { ok: true }
}

export interface KeepOption {
  /** De boeking waarvan klant en project blijven. */
  bookingId: string
  client: GearClientRef | null
  project: { id: string; name: string } | null
  label: string
}

/**
 * De verschillende klant/project-combinaties in de selectie. Eén optie: niets
 * te kiezen. Meer: het venster vraagt welke blijft.
 */
export function keepOptions(selected: MergeBooking[]): KeepOption[] {
  const seen = new Map<string, KeepOption>()
  for (const b of selected) {
    const key = `${b.client?.id ?? ''}|${b.project?.id ?? ''}`
    if (seen.has(key)) continue
    const label = [b.client?.name ?? 'Geen klant', b.project?.name].filter(Boolean).join(' · ')
    seen.set(key, { bookingId: b.id, client: b.client, project: b.project, label })
  }
  return [...seen.values()]
}

/** De notities samen zoals de database ze maakt: elke tekst één keer, gescheiden door " · ". */
export function combinedNote(selected: Pick<GearBooking, 'note'>[]): string | null {
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of selected) {
    const n = b.note?.trim()
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return out.length ? out.join(' · ') : null
}

/** Wat het formulier bij een nieuwe boeking instuurt: voor wie, en wanneer. */
export interface NewBookingProbe extends Period {
  user_id: string | null
  freelancer_id: string | null
  external_name: string | null
  client_id: string | null
}

/**
 * Bij een nieuwe boeking: de bestaande boekingen van dezelfde persoon met
 * exact dezelfde periode, die deze gebruiker mag wijzigen (anders kan
 * toevoegen niet). Leeg = gewoon boeken, niets vragen.
 */
export function samePeriodMatches<T extends MergeBooking>(probe: NewBookingProbe, candidates: T[], canChange: (b: T) => boolean): T[] {
  const key = holderOf({
    booked_for_user_id: probe.user_id, freelancer_id: probe.freelancer_id, external_name: probe.external_name,
    client: probe.client_id ? { id: probe.client_id, name: '', color: null } : null, person_name: null,
  }).key
  return candidates.filter(b => holderOf(b).key === key && samePeriod(b, probe) && canChange(b))
}

/**
 * Wat er bij opslaan gebeurt: een aparte boeking (geen overeenkomst, of
 * "Nee, aparte boeking"), of toevoegen aan de gekozen bestaande boeking.
 */
export type SaveChoice = { kind: 'separate' } | { kind: 'into'; bookingId: string; keep: 'new' | 'existing' }

export function saveRequest<B extends object>(body: B, choice: SaveChoice): B & { merge_into?: string; keep?: 'new' | 'existing' } {
  return choice.kind === 'into' ? { ...body, merge_into: choice.bookingId, keep: choice.keep } : body
}
