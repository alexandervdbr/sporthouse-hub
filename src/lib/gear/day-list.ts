import { buildGrid, type GridBar, type GridItemRow, type GridKitRow } from './grid'
import { barLabel } from './labels'
import { freeGaps, slotLabel, type Slot } from './times'
import type { GearBooking, GearCatalog, GearCategory } from './types'

// De dagweergave: per categorie dezelfde rijen als het raster (kits met hun
// onderdelen, dan losse items, in dezelfde volgorde), maar per rij de stand
// van die ene dag: vrij, of bij wie. De rijen zelf komen uit buildGrid met een
// venster van één dag; hier komt alleen de stand en de filter bij.
//
// Met uren (0085) kan een rij op één dag meerdere boekingen hebben en vrije
// stukken ertussen: "Bram · tot 10:00", "vrij 10:00–14:00", "Jan · vanaf 14:00".

export const DAY_FILTERS = ['all', 'out', 'free'] as const
export type DayFilter = typeof DAY_FILTERS[number]
export const DAY_FILTER_LABEL: Record<DayFilter, string> = { all: 'Alles', out: 'Alleen weg', free: 'Alleen vrij' }

/**
 * vrij: de hele dag te boeken · deels: geboekt én een vrij stuk · weg: de
 * hele dag geboekt · onbeschikbaar: defect, uit dienst of geen onderdeel vrij.
 */
export type DayState = 'vrij' | 'deels' | 'weg' | 'onbeschikbaar'

export interface DayItemEntry {
  kind: 'item'
  row: GridItemRow
  /** De eerste boeking die het item die dag heeft (via een kit of los). */
  booking: GearBooking | null
  holder: DayHolder | null
  /** Alle boekingen van die dag, in volgorde. */
  holders: { booking: GearBooking; holder: DayHolder }[]
  /** De vrije stukken van die dag (leeg als het niet te boeken is). */
  gaps: Slot[]
  state: DayState
}

/** Bij wie het is, voluit, in dezelfde kleur als de balk in het raster. */
export interface DayHolder {
  text: string
  color: string
  project: string | null
  /** De volledige periode van de boeking, ook buiten deze dag. */
  start: string
  end: string
  /** Iets in de boeking is defect of uit dienst (zoals de rode rand in het raster). */
  flagged: boolean
  /** De bezetting met uren, en hoe ze er die dag uitziet ("tot 10:00", "hele dag"). */
  slot: Slot
  when: string
}

export interface DayKitEntry {
  kind: 'kit'
  row: GridKitRow
  /** De eerste boeking van de kit zelf ("via" deze kit). */
  booking: GearBooking | null
  holder: DayHolder | null
  holders: { booking: GearBooking; holder: DayHolder }[]
  gaps: Slot[]
  state: DayState
  /** Onderdelen die die dag met een andere boeking weg zijn. */
  partsElsewhere: number
  parts: DayItemEntry[]
}

export type DayEntry = DayKitEntry | DayItemEntry

export interface DayGroup {
  category: GearCategory
  entries: DayEntry[]
  /** Hoeveel rijen die dag (deels) weg zijn, voor een dichtgeklapte categorie. */
  out: number
}

/** Telt als "weg" in de filter: (deels) geboekt, of een kit waarvan iets elders is. */
export function isOut(e: DayEntry): boolean {
  return e.holders.length > 0 || (e.kind === 'kit' && e.partsElsewhere > 0)
}

/** Telt als "vrij" in de filter: er is (een deel van) de dag te boeken. */
export function isFree(e: DayEntry): boolean {
  return e.state === 'vrij' || e.state === 'deels'
}

export function buildDayList(
  catalog: GearCatalog,
  bookings: GearBooking[],
  day: string,
  today: string,
  filter: DayFilter = 'all',
  search = '',
): DayGroup[] {
  const byId = new Map(bookings.map(b => [b.id, b]))
  const groups = buildGrid(catalog, bookings, { start: day, end: day }, today, search)
  // Met uren kan een rij op één dag meerdere boekingen hebben (overdracht).
  const holdersOf = (bars: GridBar[]) => bars
    .map(bar => ({ bar, booking: byId.get(bar.bookingId) }))
    .filter((x): x is { bar: GridBar; booking: GearBooking } => !!x.booking)
    .sort((a, b) => a.bar.slot.start.localeCompare(b.bar.slot.start))
    .map(({ bar, booking }) => ({ booking, holder: dayHolder(booking, bar, day) }))
  const stateOf = (holders: unknown[], gaps: Slot[], bookable: boolean): DayState =>
    !bookable && !holders.length ? 'onbeschikbaar' : !holders.length ? 'vrij' : gaps.length ? 'deels' : 'weg'

  const itemEntry = (row: GridItemRow): DayItemEntry => {
    const holders = holdersOf(row.bars)
    const off = row.item.status === 'defect' || row.item.status === 'uit_dienst'
    const gaps = off ? [] : freeGaps(day, row.bars.map(b => b.slot))
    return { kind: 'item', row, booking: holders[0]?.booking ?? null, holder: holders[0]?.holder ?? null, holders, gaps, state: stateOf(holders, gaps, !off) }
  }
  const kitEntry = (row: GridKitRow): DayKitEntry => {
    const holders = holdersOf(row.bars)
    const parts = row.parts.map(itemEntry)
    const anyPart = parts.some(p => p.gaps.length > 0)
    const gaps = anyPart ? freeGaps(day, row.bars.map(b => b.slot)) : []
    return {
      kind: 'kit', row, booking: holders[0]?.booking ?? null, holder: holders[0]?.holder ?? null, holders, gaps,
      state: stateOf(holders, gaps, anyPart), partsElsewhere: row.elsewhere[0] ?? 0, parts,
    }
  }
  const keep = (e: DayEntry) => filter === 'all' || (filter === 'out' ? isOut(e) : isFree(e))

  return groups
    .map(g => {
      const entries = g.rows.map(r => (r.kind === 'kit' ? kitEntry(r) : itemEntry(r)))
      return { category: g.category, entries: entries.filter(keep), out: entries.filter(isOut).length }
    })
    .filter(g => g.entries.length > 0)
}

/** "Bram Kreike · NoStrezz" voluit; de kleur komt van de balk, zodat iemand overal dezelfde kleur heeft. */
export function dayHolder(b: GearBooking, bar: Pick<GridBar, 'color' | 'flagged' | 'slot'>, day?: string): DayHolder {
  const { text } = barLabel({ personName: b.external_name ?? b.person_name, clientName: b.client?.name })
  return {
    text, color: bar.color, project: b.project?.name ?? null, start: b.start_date, end: b.end_date, flagged: bar.flagged,
    slot: bar.slot, when: day ? slotLabel(bar.slot, day) : slotLabel(bar.slot),
  }
}
