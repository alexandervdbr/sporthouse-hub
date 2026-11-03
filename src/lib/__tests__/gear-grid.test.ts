import { describe, it, expect } from 'vitest'
import { buildGrid } from '@/lib/gear/grid'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import type { GearBooking, GearCatalog, GearUnit } from '@/lib/gear/types'

const unit = (id: string, category_id: string, name: string, extra: Partial<GearUnit> = {}): GearUnit => ({
  id, category_id, name, quantity: 1, sort_order: 0, label_color: null, nd_size: null, warning: null, notes: null,
  status: 'ok', status_note: null, home_client_id: null, contents: [], ...extra,
})

const booking = (id: string, unit_ids: string[], start: string, end: string, extra: Partial<GearBooking> = {}): GearBooking => ({
  id, start_date: start, end_date: end, unit_ids, booked_for_user_id: null, freelancer_id: null, external_name: null,
  person_name: null, client: null, project: null, note: null, created_by: null, created_by_name: 'x', ...extra,
})

const catalog: GearCatalog = {
  categories: [
    { id: 'foto', name: 'FOTO', color: '#facc15', sort_order: 2 },
    { id: 'video', name: 'SET 1 VIDEO', color: '#3A913F', sort_order: 1 },
    { id: 'leeg', name: 'Drone', color: '#38bdf8', sort_order: 3 },
  ],
  units: [
    unit('a7r', 'foto', 'Sony A7R', { home_client_id: 'fos', sort_order: 2 }),
    unit('a7iv', 'foto', 'Sony A7 IV', { sort_order: 1 }),
    unit('fx3a', 'video', 'FX3 A'),
    unit('1635', 'foto', 'Sony 16-35', { status: 'defect', sort_order: 3 }),
  ],
  holders: [{ id: 'fos', name: 'Friends of Sports', color: '#ea580c' }],
}
const nov = { start: '2026-11-01', end: '2026-11-30' }

describe('buildGrid', () => {
  it('ordent categorieën en units en laat lege categorieën weg', () => {
    const g = buildGrid(catalog, [], nov, '2026-11-03')
    expect(g.map(x => x.category.name)).toEqual(['SET 1 VIDEO', 'FOTO'])
    expect(g[1].rows.map(r => r.unit.name)).toEqual(['Sony A7 IV', 'Sony A7R', 'Sony 16-35'])
  })

  it('geeft een unit zijn vaste houder', () => {
    const row = buildGrid(catalog, [], nov, '2026-11-03')[1].rows[1]
    expect(row.holder?.name).toBe('Friends of Sports')
  })

  it('maakt balken met voornaam, klant, of allebei', () => {
    const g = buildGrid(catalog, [
      booking('b1', ['fx3a'], '2026-11-03', '2026-11-05', { person_name: 'Bram Kreike', booked_for_user_id: 'u1' }),
      booking('b2', ['a7iv'], '2026-11-10', '2026-11-10', { client: { id: 'ns', name: 'NoStrezz', color: '#ff0000' } }),
      booking('b3', ['a7r'], '2026-11-12', '2026-11-13', { person_name: 'Arne - EXTERN', external_name: 'Arne - EXTERN',
        client: { id: 'ns', name: 'NoStrezz', color: '#ff0000' } }),
    ], nov, '2026-11-03')
    expect(g[0].rows[0].bars[0]).toMatchObject({ startIndex: 2, span: 3, text: 'Bram' })
    expect(g[1].rows[0].bars[0]).toMatchObject({ text: 'NoStrezz', color: '#ff0000' })
    expect(g[1].rows[1].bars[0]).toMatchObject({ text: 'Arne - EXTERN · NoStrezz' })
  })

  it('zet één boeking met meerdere units op elke rij', () => {
    const g = buildGrid(catalog, [booking('b1', ['fx3a', 'a7iv'], '2026-11-03', '2026-11-03', { person_name: 'Jelle' })], nov, '2026-11-03')
    expect(g[0].rows[0].bars).toHaveLength(1)
    expect(g[1].rows[0].bars).toHaveLength(1)
  })

  it('markeert een lopende boeking van materiaal dat intussen defect is', () => {
    const g = buildGrid(catalog, [
      booking('oud', ['1635'], '2026-11-01', '2026-11-02', { person_name: 'Kenny' }),
      booking('komt', ['1635'], '2026-11-20', '2026-11-21', { person_name: 'Kenny' }),
    ], nov, '2026-11-03')
    const bars = g[1].rows[2].bars
    expect(bars.map(b => [b.bookingId, b.flagged])).toEqual([['oud', false], ['komt', true]])
  })

  it('zoekt op naam, categorie en vaste houder', () => {
    expect(buildGrid(catalog, [], nov, '2026-11-03', 'fx3').flatMap(g => g.rows.map(r => r.unit.id))).toEqual(['fx3a'])
    expect(buildGrid(catalog, [], nov, '2026-11-03', 'friends').flatMap(g => g.rows.map(r => r.unit.id))).toEqual(['a7r'])
    expect(buildGrid(catalog, [], nov, '2026-11-03', 'foto').flatMap(g => g.rows.map(r => r.unit.id))).toHaveLength(3)
  })
})

describe('canChangeBooking', () => {
  const res: GearAccess = { view: true, book: true, manageBookings: false, manageCatalog: false }
  const man: GearAccess = { view: true, book: true, manageBookings: true, manageCatalog: true }
  const view: GearAccess = { view: true, book: false, manageBookings: false, manageCatalog: false }
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
