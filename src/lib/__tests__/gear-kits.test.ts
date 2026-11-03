import { describe, it, expect } from 'vitest'
import { bookedLines, bookingSelection, checkKitParts, kitByItem, selectionFromBooking } from '@/lib/gear/kits'
import { planNumbering } from '@/lib/gear/naming'
import { effectiveResponsible, responsibleLabel, responsibleName, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import type { GearBooking, GearItem, GearKit } from '@/lib/gear/types'

const none = { responsible_client_id: null, responsible_user_id: null, responsible_name: null }
const item = (id: string, name: string, extra: Partial<GearItem> = {}): GearItem => ({
  id, category_id: 'c', name, model: null, number: null, serial_number: null, sort_order: 0, label_color: null,
  nd_size: null, warning: null, notes: null, status: 'ok', status_note: null, ...none, ...extra,
})
const kit = (id: string, name: string, item_ids: string[], extra: Partial<GearKit> = {}): GearKit => ({
  id, category_id: 'c', name, label_color: null, warning: null, notes: null, sort_order: 0, item_ids, ...none, ...extra,
})
const booking = (id: string, lines: [string, string | null][], start: string, end: string, extra: Partial<GearBooking> = {}): GearBooking => ({
  id, start_date: start, end_date: end, lines: lines.map(([item_id, via]) => ({ item_id, via_kit_id: via, via_kit_name: via })),
  booked_for_user_id: null, freelancer_id: null, external_name: null, person_name: null, client: null, project: null,
  note: null, created_by: null, created_by_name: 'x', ...extra,
})

const items = new Map([
  item('body', 'Sony FX3 A'), item('lens', 'Sony 24-70mm #1'),
  item('bat', 'Sony batterij #1', { status: 'defect' }), item('mon', 'Monitor Shinobi', { status: 'beperkt' }),
].map(i => [i.id, i]))
const fx3a = kit('fx3a', 'FX3 A', ['body', 'lens', 'bat', 'mon'])

describe('checkKitParts', () => {
  const booked = bookedLines([booking('elders', [['lens', null]], '2026-11-14', '2026-11-16', { person_name: 'Jelle' })])

  it('geeft per onderdeel de toestand op de gekozen dagen', () => {
    const parts = checkKitParts(fx3a, items, { start: '2026-11-15', end: '2026-11-15' }, booked)
    expect(parts.map(p => [p.item.id, p.state, p.blocking])).toEqual([
      ['body', 'ok', false], ['lens', 'elders', true], ['bat', 'defect', true], ['mon', 'beperkt', false],
    ])
    expect(parts[1].conflicts[0]).toMatchObject({ holderLabel: 'Jelle', days: { start: '2026-11-15', end: '2026-11-15' } })
  })

  it('buiten die dagen is het onderdeel gewoon vrij', () => {
    const parts = checkKitParts(fx3a, items, { start: '2026-11-20', end: '2026-11-21' }, booked)
    expect(parts.find(p => p.item.id === 'lens')!.state).toBe('ok')
  })

  it('bij wijzigen botst de eigen boeking niet met zichzelf', () => {
    const own = bookedLines([booking('mijn', [['lens', 'fx3a']], '2026-11-15', '2026-11-15')])
    expect(checkKitParts(fx3a, items, { start: '2026-11-15', end: '2026-11-15' }, own, 'mijn')[1].state).toBe('ok')
  })
})

describe('bookingSelection / selectionFromBooking', () => {
  const kits = new Map([[fx3a.id, fx3a]])

  it('stuurt alleen weglatingen mee die echt in een gekozen kit zitten', () => {
    expect(bookingSelection(['los'], ['fx3a'], new Set(['bat', 'iets-anders']), kits))
      .toEqual({ item_ids: ['los'], kit_ids: ['fx3a'], excluded_item_ids: ['bat'] })
  })

  it('splitst een bestaande boeking terug op in kits, losse items en weglatingen', () => {
    const b = booking('b', [['body', 'fx3a'], ['lens', 'fx3a'], ['mon', 'fx3a'], ['los', null]], '2026-11-15', '2026-11-15')
    const sel = selectionFromBooking(b, kits)
    expect(sel.kitIds).toEqual(['fx3a'])
    expect(sel.looseItemIds).toEqual(['los'])
    expect([...sel.excluded]).toEqual(['bat'])
  })

  it('kitByItem kent per item zijn kit', () => {
    expect(kitByItem([fx3a]).get('lens')?.name).toBe('FX3 A')
  })
})

describe('planNumbering', () => {
  it('nummert verder op wat er al is', () => {
    expect(planNumbering('Sony batterij', ['Sony batterij #1', 'Sony batterij #16', 'Iets anders'], 2).names.map(n => n.name))
      .toEqual(['Sony batterij #17', 'Sony batterij #18'])
  })
  it('één nieuw voorwerp van een nieuw model krijgt geen nummer', () => {
    expect(planNumbering('Monitor Shinobi', [], 1)).toEqual({ names: [{ name: 'Monitor Shinobi', number: null }], renameUnnumbered: false })
  })
  it('meerdere nieuwe voorwerpen beginnen bij #1', () => {
    expect(planNumbering('Lexar SD-kaart', [], 3).names.map(n => n.number)).toEqual(['#1', '#2', '#3'])
  })
  it('een kaal bestaand voorwerp wordt #1 en de nieuwe tellen door', () => {
    expect(planNumbering('HDMI-kabel', ['hdmi-kabel'], 2)).toEqual({
      names: [{ name: 'HDMI-kabel #2', number: '#2' }, { name: 'HDMI-kabel #3', number: '#3' }], renameUnnumbered: true,
    })
  })
  it('lege invoer geeft niets', () => {
    expect(planNumbering('  ', [], 2).names).toEqual([])
  })
})

describe('verantwoordelijke', () => {
  const clients = new Map([['spor', { id: 'spor', name: 'Sporting Hasselt', color: null }]])

  it('een klant, een collega, of een verwijderd account', () => {
    expect(responsibleName({ ...none, responsible_client_id: 'spor' }, clients)).toBe('Sporting Hasselt')
    expect(responsibleName({ ...none, responsible_user_id: 'u', responsible_name: 'Bram Kreike' }, clients)).toBe('Bram Kreike')
    expect(responsibleName({ ...none, responsible_name: 'Bram Kreike' }, clients)).toBe('Bram Kreike (account verwijderd)')
    expect(responsibleName(none, clients)).toBeNull()
  })

  it('het item gaat voor op de kit; anders "via kit"', () => {
    const k = kit('k', 'Sony A7R', [], { responsible_client_id: 'spor' })
    expect(effectiveResponsible(none, k, clients)).toEqual({ name: 'Sporting Hasselt', viaKit: 'Sony A7R' })
    expect(effectiveResponsible({ ...none, responsible_user_id: 'u', responsible_name: 'Bram' }, k, clients))
      .toEqual({ name: 'Bram', viaKit: null })
    expect(effectiveResponsible(none, null, clients)).toBeNull()
  })

  it('tekst zoals afgesproken', () => {
    expect(RESPONSIBLE_NOTICE).toBe('Dit materiaal kan gehuurd worden in samenspraak met de verantwoordelijke.')
    expect(responsibleLabel({ name: 'Sporting Hasselt', viaKit: null })).toBe('Verantwoordelijke: Sporting Hasselt')
    expect(responsibleLabel({ name: 'Friends of Sports', viaKit: 'Sony A7R' })).toBe('Verantwoordelijke: Friends of Sports (via kit Sony A7R)')
  })
})
