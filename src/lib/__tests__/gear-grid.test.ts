import { describe, it, expect } from 'vitest'
import { buildGrid, freeStretches, type GridItemRow, type GridKitRow } from '@/lib/gear/grid'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import type { GearBooking, GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

const none = { responsible_client_id: null, responsible_user_id: null, responsible_name: null }

const item = (id: string, category_id: string, name: string, extra: Partial<GearItem> = {}): GearItem => ({
  id, category_id, name, model: null, number: null, serial_number: null, sort_order: 0, label_color: null, nd_size: null,
  warning: null, notes: null, status: 'ok', status_note: null, ...none, ...extra,
})

const kit = (id: string, category_id: string, name: string, item_ids: string[], extra: Partial<GearKit> = {}): GearKit => ({
  id, category_id, name, label_color: null, warning: null, notes: null, sort_order: 0, item_ids, ...none, ...extra,
})

const booking = (id: string, lines: [string, string | null][], start: string, end: string, extra: Partial<GearBooking> = {}): GearBooking => ({
  id, start_date: start, end_date: end, lines: lines.map(([item_id, via]) => ({ item_id, via_kit_id: via, via_kit_name: via })),
  booked_for_user_id: null, freelancer_id: null, external_name: null, person_name: null, client: null, project: null,
  note: null, created_by: null, created_by_name: 'x', ...extra,
})

const catalog: GearCatalog = {
  categories: [
    { id: 'foto', name: 'FOTO', color: '#facc15', sort_order: 2 },
    { id: 'video', name: 'SET 1 VIDEO', color: '#3A913F', sort_order: 1 },
    { id: 'leeg', name: 'Drone', color: '#38bdf8', sort_order: 3 },
  ],
  items: [
    item('body', 'video', 'Sony FX3 A', { model: 'Sony FX3' }),
    item('lens', 'video', 'Sony 24-70mm #1', { model: 'Sony 24-70mm' }),
    item('bat', 'video', 'Sony batterij #1', { model: 'Sony batterij', status: 'defect' }),
    item('a7r', 'foto', 'Sony A7R body'),
    item('a7v', 'foto', 'Sony A7 V', { sort_order: 1 }),
    item('lens2', 'foto', 'Sigma 70-200mm', { sort_order: 2, responsible_client_id: 'spor' }),
  ],
  kits: [
    kit('fx3a', 'video', 'FX3 A (groene labels)', ['body', 'lens', 'bat']),
    kit('kit-a7r', 'foto', 'Sony A7R', ['a7r'], { responsible_client_id: 'fos' }),
  ],
  clients: [{ id: 'fos', name: 'Friends of Sports', color: '#ea580c' }, { id: 'spor', name: 'Sporting Hasselt', color: '#6d28d9' }],
}
const nov = { start: '2026-11-01', end: '2026-11-30' }

describe('buildGrid', () => {
  it('toont per categorie eerst de kits, dan de losse items; lege categorieën vallen weg', () => {
    const g = buildGrid(catalog, [], nov, '2026-11-03')
    expect(g.map(x => x.category.name)).toEqual(['SET 1 VIDEO', 'FOTO'])
    expect(g[0].rows.map(r => r.kind)).toEqual(['kit'])
    expect(g[1].rows.map(r => r.kind === 'kit' ? r.kit.name : r.item.name)).toEqual(['Sony A7R', 'Sony A7 V', 'Sigma 70-200mm'])
  })

  it('onderdelen van een kit staan niet ook nog los', () => {
    const names = buildGrid(catalog, [], nov, '2026-11-03').flatMap(g => g.rows).filter(r => r.kind === 'item').map(r => (r as GridItemRow).item.name)
    expect(names).not.toContain('Sony FX3 A')
  })

  it('kit-rij: onderdelen in volgorde, defecte onderdelen geteld', () => {
    const k = buildGrid(catalog, [], nov, '2026-11-03')[0].rows[0] as GridKitRow
    expect(k.parts.map(p => p.item.name)).toEqual(['Sony FX3 A', 'Sony 24-70mm #1', 'Sony batterij #1'])
    expect(k.defectParts).toBe(1)
  })

  it('verantwoordelijke: eigen op het item, of via de kit', () => {
    const g = buildGrid(catalog, [], nov, '2026-11-03')
    const a7r = g[1].rows[0] as GridKitRow
    expect(a7r.responsible).toMatchObject({ name: 'Friends of Sports', viaKit: null })
    expect(a7r.parts[0].responsible).toMatchObject({ name: 'Friends of Sports', viaKit: 'Sony A7R' })
    expect((g[1].rows[2] as GridItemRow).responsible).toMatchObject({ name: 'Sporting Hasselt', viaKit: null })
  })

  it('een boeking via de kit is een balk op de kit-rij én op elk geboekt onderdeel', () => {
    const k = buildGrid(catalog, [
      booking('b1', [['body', 'fx3a'], ['lens', 'fx3a']], '2026-11-03', '2026-11-05', { person_name: 'Bram Kreike' }),
    ], nov, '2026-11-03')[0].rows[0] as GridKitRow
    expect(k.bars).toMatchObject([{ bookingId: 'b1', startIndex: 2, span: 3, text: 'Bram' }])
    expect(k.parts[0].bars).toHaveLength(1)
    expect(k.parts[2].bars).toHaveLength(0)
  })

  it('een onderdeel dat via een andere boeking weg is, telt als "elders" op die dagen', () => {
    const k = buildGrid(catalog, [
      booking('los', [['lens', null]], '2026-11-10', '2026-11-11', { external_name: 'Arne', person_name: 'Arne' }),
    ], nov, '2026-11-03')[0].rows[0] as GridKitRow
    expect(k.bars).toHaveLength(0)
    expect(k.elsewhere.slice(8, 12)).toEqual([0, 1, 1, 0])
  })

  it('markeert een komende kit-boeking met een intussen defect onderdeel', () => {
    const k = buildGrid(catalog, [
      booking('komt', [['body', 'fx3a'], ['bat', 'fx3a']], '2026-11-20', '2026-11-21', { person_name: 'Kenny' }),
    ], nov, '2026-11-03')[0].rows[0] as GridKitRow
    expect(k.bars[0].flagged).toBe(true)
  })

  it('zoekt op kit, item, model en verantwoordelijke; een kit blijft staan als een onderdeel matcht', () => {
    const find = (q: string) => buildGrid(catalog, [], nov, '2026-11-03', q).flatMap(g => g.rows.map(r => r.kind === 'kit' ? `kit:${r.kit.name}` : r.item.name))
    expect(find('24-70')).toEqual(['kit:FX3 A (groene labels)'])
    expect(find('sporting')).toEqual(['Sigma 70-200mm'])
    expect(find('friends')).toEqual(['kit:Sony A7R'])
  })
})

describe('canChangeBooking', () => {
  const res: GearAccess = { view: true, book: true, manageBookings: false, manageCatalog: false, reorderCategories: false }
  const man: GearAccess = { view: true, book: true, manageBookings: true, manageCatalog: true, reorderCategories: false }
  const view: GearAccess = { view: true, book: false, manageBookings: false, manageCatalog: false, reorderCategories: false }
  const b = { created_by: 'me', booked_for_user_id: null, end_date: '2026-11-10' }

  it('eigen boeking (gemaakt door of voor jou) zolang ze niet voorbij is', () => {
    expect(canChangeBooking(b, 'me', res, '2026-11-03')).toBe(true)
    expect(canChangeBooking({ ...b, created_by: 'ander', booked_for_user_id: 'me' }, 'me', res, '2026-11-03')).toBe(true)
    expect(canChangeBooking(b, 'me', res, '2026-11-11')).toBe(false)
  })
  it('niet die van een ander, behalve met Beheren', () => {
    expect(canChangeBooking(b, 'ander', res, '2026-11-03')).toBe(false)
    expect(canChangeBooking(b, 'ander', man, '2026-12-01')).toBe(true)
  })
  it('kijkers wijzigen niets', () => {
    expect(canChangeBooking(b, 'me', view, '2026-11-03')).toBe(false)
  })
})

describe('freeStretches (band van de verantwoordelijke)', () => {
  const bar = (startIndex: number, span: number) => ({ bookingId: 'b', startIndex, span, continuesBefore: false, continuesAfter: false })
  it('de vrije stukken tussen de boekingen', () => {
    expect(freeStretches([bar(2, 3)], 7)).toEqual([{ startIndex: 0, span: 2 }, { startIndex: 5, span: 2 }])
    expect(freeStretches([], 3)).toEqual([{ startIndex: 0, span: 3 }])
    expect(freeStretches([bar(0, 7)], 7)).toEqual([])
  })
})

describe('onderdeel weet in welke kit het zit', () => {
  it('kitId op een onderdeel, null op een los item', () => {
    const g = buildGrid(catalog, [], nov, '2026-11-03')
    expect((g[0].rows[0] as GridKitRow).parts[0].kitId).toBe('fx3a')
    expect((g[1].rows[1] as GridItemRow).kitId).toBeNull()
  })
})
