import { buildBars, type Bar } from './bars'
import { eachDay } from './dates'
import { barLabel, shortNames, type BarLabel } from './labels'
import type { DateRange } from './ranges'
import { effectiveResponsible, responsibleName, type EffectiveResponsible } from './responsible'
import type { GearBooking, GearCatalog, GearCategory, GearItem, GearKit } from './types'

// Catalogus + boekingen → wat het raster tekent. Per categorie eerst de kits
// (één rij, open te klappen naar hun onderdelen), dan de losse items. Het
// raster zelf weet niets van boekingen; zo kan de oriëntatie later wisselen.

export interface GridBar extends Bar, BarLabel {
  /** Iets in deze boeking is defect of uit dienst terwijl ze loopt of nog komt. */
  flagged: boolean
  /** Project van de boeking; de weekweergave heeft plaats om het te tonen. */
  project: string | null
}

export interface GridItemRow {
  kind: 'item'
  item: GearItem
  responsible: EffectiveResponsible | null
  bars: GridBar[]
}

export interface GridKitRow {
  kind: 'kit'
  kit: GearKit
  responsible: EffectiveResponsible | null
  parts: GridItemRow[]
  /** Boekingen van (een deel van) de kit "via" deze kit. */
  bars: GridBar[]
  /** Per dag: hoeveel onderdelen via een andere boeking weg zijn ("elders"). */
  elsewhere: number[]
  defectParts: number
  limitedParts: number
}

export type GridRow = GridKitRow | GridItemRow

export interface GridGroup {
  category: GearCategory
  rows: GridRow[]
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
  const days = eachDay(window.start, window.end)
  const short = shortNames([...new Set(bookings.filter(b => b.person_name && !b.external_name).map(b => b.person_name!))])
  const clients = new Map(catalog.clients.map(c => [c.id, c]))
  const itemById = new Map(catalog.items.map(i => [i.id, i]))
  const kitOf = new Map<string, GearKit>()
  for (const k of catalog.kits) for (const id of k.item_ids) kitOf.set(id, k)
  const label = (b: GearBooking) => barLabel({ personName: bookingPersonLabel(b, short), clientName: b.client?.name, clientColor: b.client?.color })
  const unavailable = (i: GearItem | undefined) => !!i && (i.status === 'defect' || i.status === 'uit_dienst')

  const byItem = new Map<string, GearBooking[]>()
  for (const b of bookings) for (const l of b.lines) byItem.set(l.item_id, [...(byItem.get(l.item_id) ?? []), b])

  const itemRow = (item: GearItem): GridItemRow => ({
    kind: 'item',
    item,
    responsible: effectiveResponsible(item, kitOf.get(item.id) ?? null, clients),
    bars: buildBars((byItem.get(item.id) ?? []).map(b => ({ bookingId: b.id, range: { start: b.start_date, end: b.end_date }, cancelled: false })), window)
      .map(bar => {
        const b = bookings.find(x => x.id === bar.bookingId)!
        return { ...bar, ...label(b), flagged: unavailable(item) && b.end_date >= today, project: b.project?.name ?? null }
      }),
  })

  const kitRow = (kit: GearKit): GridKitRow => {
    const parts = kit.item_ids.map(id => itemById.get(id)).filter((i): i is GearItem => !!i)
    const via = bookings.filter(b => b.lines.some(l => l.via_kit_id === kit.id))
    const bars = buildBars(via.map(b => ({ bookingId: b.id, range: { start: b.start_date, end: b.end_date }, cancelled: false })), window)
      .map(bar => {
        const b = via.find(x => x.id === bar.bookingId)!
        const flagged = b.end_date >= today && b.lines.some(l => l.via_kit_id === kit.id && unavailable(itemById.get(l.item_id)))
        return { ...bar, ...label(b), flagged, project: b.project?.name ?? null }
      })
    const partIds = new Set(kit.item_ids)
    const elsewhere = days.map(d => {
      const out = new Set<string>()
      for (const b of bookings) {
        if (d < b.start_date || d > b.end_date) continue
        for (const l of b.lines) if (partIds.has(l.item_id) && l.via_kit_id !== kit.id) out.add(l.item_id)
      }
      return out.size
    })
    return {
      kind: 'kit',
      kit,
      responsible: (() => { const name = responsibleName(kit, clients); return name ? { name, viaKit: null } : null })(),
      parts: parts.map(itemRow),
      bars,
      elsewhere,
      defectParts: parts.filter(unavailable).length,
      limitedParts: parts.filter(p => p.status === 'beperkt').length,
    }
  }

  const q = search.trim().toLowerCase()
  const respText = (r: EffectiveResponsible | null) => (r?.name ?? '').toLowerCase()
  const itemMatches = (r: GridItemRow, cat: GearCategory) =>
    !q || r.item.name.toLowerCase().includes(q) || (r.item.model ?? '').toLowerCase().includes(q)
       || cat.name.toLowerCase().includes(q) || respText(r.responsible).includes(q)

  return [...catalog.categories]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
    .map(category => {
      const kits = catalog.kits
        .filter(k => k.category_id === category.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
        .map(kitRow)
        .filter(k => !q || k.kit.name.toLowerCase().includes(q) || category.name.toLowerCase().includes(q)
                      || respText(k.responsible).includes(q) || k.parts.some(p => itemMatches(p, category)))
      const loose = catalog.items
        .filter(i => i.category_id === category.id && !kitOf.has(i.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl'))
        .map(itemRow)
        .filter(r => itemMatches(r, category))
      return { category, rows: [...kits, ...loose] as GridRow[] }
    })
    .filter(g => g.rows.length > 0)
}
