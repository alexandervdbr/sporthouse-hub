import { buildGrid, type GridBar, type GridItemRow, type GridKitRow } from './grid'
import { barLabel } from './labels'
import type { GearBooking, GearCatalog, GearCategory } from './types'

// De dagweergave: per categorie dezelfde rijen als het raster (kits met hun
// onderdelen, dan losse items, in dezelfde volgorde), maar per rij de stand
// van die ene dag: vrij, of bij wie. De rijen zelf komen uit buildGrid met een
// venster van één dag; hier komt alleen de stand en de filter bij.

export const DAY_FILTERS = ['all', 'out', 'free'] as const
export type DayFilter = typeof DAY_FILTERS[number]
export const DAY_FILTER_LABEL: Record<DayFilter, string> = { all: 'Alles', out: 'Alleen weg', free: 'Alleen vrij' }

/** vrij: te boeken · weg: geboekt · onbeschikbaar: defect, uit dienst of geen onderdeel vrij. */
export type DayState = 'vrij' | 'weg' | 'onbeschikbaar'

export interface DayItemEntry {
  kind: 'item'
  row: GridItemRow
  /** De boeking die het item die dag heeft (via een kit of los). */
  booking: GearBooking | null
  holder: DayHolder | null
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
}

export interface DayKitEntry {
  kind: 'kit'
  row: GridKitRow
  /** De boeking van de kit zelf ("via" deze kit). */
  booking: GearBooking | null
  holder: DayHolder | null
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

/** Telt als "weg" in de filter: geboekt, of een kit waarvan iets elders is. */
export function isOut(e: DayEntry): boolean {
  return e.state === 'weg' || (e.kind === 'kit' && e.partsElsewhere > 0)
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
  // Op één dag heeft een item of kit hooguit één boeking (de database weigert overlap).
  const holderOf = (bars: GridBar[]) => {
    const booking = bars[0] ? byId.get(bars[0].bookingId) ?? null : null
    return { booking, holder: booking ? dayHolder(booking, bars[0]) : null }
  }

  const itemEntry = (row: GridItemRow): DayItemEntry => {
    const { booking, holder } = holderOf(row.bars)
    const off = row.item.status === 'defect' || row.item.status === 'uit_dienst'
    return { kind: 'item', row, booking, holder, state: booking ? 'weg' : off ? 'onbeschikbaar' : 'vrij' }
  }
  const kitEntry = (row: GridKitRow): DayKitEntry => {
    const { booking, holder } = holderOf(row.bars)
    const parts = row.parts.map(itemEntry)
    const state: DayState = booking ? 'weg' : parts.some(p => p.state === 'vrij') ? 'vrij' : 'onbeschikbaar'
    return { kind: 'kit', row, booking, holder, state, partsElsewhere: row.elsewhere[0] ?? 0, parts }
  }
  const keep = (e: DayEntry) => filter === 'all' || (filter === 'out' ? isOut(e) : e.state === 'vrij')

  return groups
    .map(g => {
      const entries = g.rows.map(r => (r.kind === 'kit' ? kitEntry(r) : itemEntry(r)))
      return { category: g.category, entries: entries.filter(keep), out: entries.filter(isOut).length }
    })
    .filter(g => g.entries.length > 0)
}

/** "Bram Kreike · NoStrezz" voluit; de kleur komt van de balk, zodat iemand overal dezelfde kleur heeft. */
export function dayHolder(b: GearBooking, bar: Pick<GridBar, 'color' | 'flagged'>): DayHolder {
  const { text } = barLabel({ personName: b.external_name ?? b.person_name, clientName: b.client?.name })
  return { text, color: bar.color, project: b.project?.name ?? null, start: b.start_date, end: b.end_date, flagged: bar.flagged }
}
