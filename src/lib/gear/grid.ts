import { buildBars, type Bar } from './bars'
import { barLabel, shortNames, type BarLabel } from './labels'
import type { DateRange } from './ranges'
import type { GearBooking, GearCatalog, GearCategory, GearClientRef, GearUnit } from './types'

// Catalogus + boekingen → wat het raster tekent. Het raster zelf (rijen of
// kolommen) weet niets van boekingen; zo kan de oriëntatie later wisselen
// zonder deze logica aan te raken.

export interface GridBar extends Bar, BarLabel {
  /** Unit is defect of uit dienst terwijl deze boeking loopt of nog komt. */
  flagged: boolean
}

export interface GridUnitRow {
  unit: GearUnit
  holder: GearClientRef | null
  bars: GridBar[]
}

export interface GridGroup {
  category: GearCategory
  rows: GridUnitRow[]
}

/** Naam op de balk: kort (voornaam), of de externe naam zoals ingegeven. */
export function bookingPersonLabel(b: GearBooking, short: Map<string, string>): string | null {
  if (!b.person_name) return null
  if (b.external_name) return b.external_name
  return short.get(b.person_name) ?? b.person_name
}

export function buildGrid(
  catalog: GearCatalog,
  bookings: GearBooking[],
  window: DateRange,
  today: string,
  search = '',
): GridGroup[] {
  const short = shortNames([...new Set(bookings.filter(b => b.person_name && !b.external_name).map(b => b.person_name!))])
  const bookingById = new Map(bookings.map(b => [b.id, b]))
  const holderById = new Map(catalog.holders.map(h => [h.id, h]))

  const byUnit = new Map<string, GearBooking[]>()
  for (const b of bookings) for (const id of b.unit_ids) byUnit.set(id, [...(byUnit.get(id) ?? []), b])

  const q = search.trim().toLowerCase()
  const matches = (u: GearUnit, cat: GearCategory) =>
    !q || u.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q)
       || (u.home_client_id ? (holderById.get(u.home_client_id)?.name ?? '').toLowerCase().includes(q) : false)

  return [...catalog.categories]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
    .map(category => {
      const rows = catalog.units
        .filter(u => u.category_id === category.id && matches(u, category))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
        .map(unit => {
          const unavailable = unit.status === 'defect' || unit.status === 'uit_dienst'
          const bars = buildBars(
            (byUnit.get(unit.id) ?? []).map(b => ({ bookingId: b.id, range: { start: b.start_date, end: b.end_date }, cancelled: false })),
            window,
          ).map(bar => {
            const b = bookingById.get(bar.bookingId)!
            const label = barLabel({ personName: bookingPersonLabel(b, short), clientName: b.client?.name, clientColor: b.client?.color })
            return { ...bar, ...label, flagged: unavailable && b.end_date >= today }
          })
          return { unit, holder: unit.home_client_id ? holderById.get(unit.home_client_id) ?? null : null, bars }
        })
      return { category, rows }
    })
    .filter(g => g.rows.length > 0)
}
