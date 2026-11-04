import { describe, it, expect } from 'vitest'
import { buildInventory, categoryContents, invertPlan, isFiltering, planAddToKit, planDrop, planMoveTo, planShift, serialDuplicates, touchesBookings, undoLeftovers, VIEW_LABEL } from '@/lib/gear/inventory'
import { previewMove } from '@/lib/gear/kits'
import type { GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

const none = { responsible_client_id: null, responsible_user_id: null, responsible_name: null }
const item = (id: string, category_id: string, name: string, sort_order = 0, extra: Partial<GearItem> = {}): GearItem => ({
  id, category_id, name, model: null, number: null, serial_number: null, sort_order, label_color: null, nd_size: null,
  warning: null, notes: null, status: 'ok', status_note: null, ...none, ...extra,
})
const kit = (id: string, category_id: string, name: string, item_ids: string[], sort_order = 0, extra: Partial<GearKit> = {}): GearKit => ({
  id, category_id, name, label_color: null, warning: null, notes: null, sort_order, item_ids, ...none, ...extra,
})

// Video: kits A en B, los FS7. Batterijen: losse batterij #3. Drone: leeg.
const catalog: GearCatalog = {
  categories: [
    { id: 'video', name: 'Video', color: '#3A913F', sort_order: 1 },
    { id: 'bat', name: 'Batterijen & laders', color: '#65a30d', sort_order: 17 },
    { id: 'drone', name: 'Drone', color: '#38bdf8', sort_order: 12 },
  ],
  items: [
    item('bodyA', 'video', 'Sony FX3 A', 1, { serial_number: 'SN-111' }),
    item('lensA', 'video', 'Sony 24-70mm #1', 2),
    item('batA', 'bat', 'Sony batterij #1', 3, { model: 'Sony batterij', status: 'defect' }),
    item('bodyB', 'video', 'Sony FX3 B', 1),
    item('fs7', 'video', 'Sony FS7', 1),
    item('bat3', 'bat', 'Sony batterij #3', 1, { model: 'Sony batterij' }),
    item('bat4', 'bat', 'Sony batterij #4', 2, { model: 'Sony batterij', responsible_client_id: 'fos' }),
  ],
  kits: [
    kit('A', 'video', 'FX3 A (groene labels)', ['bodyA', 'lensA', 'batA'], 1),
    kit('B', 'video', 'FX3 B (wit label)', ['bodyB'], 2, { responsible_client_id: 'spor' }),
  ],
  clients: [{ id: 'fos', name: 'Friends of Sports', color: null }, { id: 'spor', name: 'Sporting Hasselt', color: null }],
}

describe('buildInventory', () => {
  it('categorie → kits → onderdelen, plus losse items; onderdelen staan niet ook los', () => {
    const t = buildInventory(catalog)
    expect(t.map(c => c.category.name)).toEqual(['Video', 'Drone', 'Batterijen & laders'])
    expect(t[0].kits.map(k => [k.kit.name, k.parts.map(p => p.id)])).toEqual([
      ['FX3 A (groene labels)', ['bodyA', 'lensA', 'batA']], ['FX3 B (wit label)', ['bodyB']],
    ])
    expect(t[0].loose.map(i => i.id)).toEqual(['fs7'])
    expect(t[2].loose.map(i => i.id)).toEqual(['bat3', 'bat4'])   // batA zit in kit A
  })

  it('lege categorieën staan er zonder filter wel', () => {
    expect(buildInventory(catalog).find(c => c.category.id === 'drone')!.kits).toEqual([])
  })

  it('zoekt op naam, model, serienummer en kit', () => {
    const ids = (q: string) => buildInventory(catalog, { search: q }).flatMap(c => [...c.kits.flatMap(k => k.parts), ...c.loose].map(i => i.id))
    expect(ids('SN-111')).toEqual(['bodyA'])
    expect(ids('fx3 b')).toEqual(['bodyB'])          // kitnaam: hele kit
    expect(ids('sony batterij')).toEqual(['batA', 'bat3', 'bat4'])
  })

  it('één weergave tegelijk: problemen, niet in een kit, met verantwoordelijke', () => {
    const ids = (f: Parameters<typeof buildInventory>[1]) =>
      buildInventory(catalog, f).flatMap(c => [...c.kits.flatMap(k => k.parts), ...c.loose].map(i => i.id))
    expect(ids({ view: 'problems' })).toEqual(['batA'])
    expect(ids({ view: 'notInKit' })).toEqual(['fs7', 'bat3', 'bat4'])
    expect(ids({ view: 'withResponsible' })).toEqual(['bodyB', 'bat4'])   // kit B (via kit), en eigen
    expect(ids({ view: 'all' })).toHaveLength(7)
  })

  it('zoeken werkt binnen de gekozen weergave', () => {
    const ids = (f: Parameters<typeof buildInventory>[1]) =>
      buildInventory(catalog, f).flatMap(c => [...c.kits.flatMap(k => k.parts), ...c.loose].map(i => i.id))
    expect(ids({ view: 'notInKit', search: 'batterij' })).toEqual(['bat3', 'bat4'])   // batA zit in een kit
    expect(ids({ view: 'problems', search: 'fx3' })).toEqual(['batA'])   // via de kitnaam FX3 A
    expect(ids({ view: 'problems', search: 'lens' })).toEqual([])
    expect(ids({ view: 'problems', search: 'batterij' })).toEqual(['batA'])
  })

  it('weet wanneer er gefilterd wordt, en kent de namen van de weergaven', () => {
    expect(isFiltering({})).toBe(false)
    expect(isFiltering({ view: 'all', search: '  ' })).toBe(false)
    expect(isFiltering({ view: 'problems' })).toBe(true)
    expect(isFiltering({ search: 'fx3' })).toBe(true)
    expect(VIEW_LABEL).toEqual({ all: 'Alles', problems: 'Defect of beperkt', notInKit: 'Niet in een kit', withResponsible: 'Met verantwoordelijke' })
  })
})

describe('serienummers', () => {
  it('vindt een ander item met hetzelfde serienummer, zonder hoofdletters of spaties', () => {
    expect(serialDuplicates(catalog, ' sn-111 ').map(i => i.id)).toEqual(['bodyA'])
    expect(serialDuplicates(catalog, 'SN-111', 'bodyA')).toEqual([])        // zichzelf telt niet
    expect(serialDuplicates(catalog, '')).toEqual([])
    expect(serialDuplicates(catalog, 'SN-999')).toEqual([])
  })
})

describe('nieuw item in een kit = erin verplaatsen', () => {
  const plan = planAddToKit([{ id: 'nieuw1', name: 'Sony batterij #5' }, { id: 'nieuw2', name: 'Sony batterij #6' }], { id: 'A', name: 'FX3 A (groene labels)' })

  it('verhuisstappen met boekingen bijwerken aan, zoals slepen', () => {
    expect(plan.steps).toEqual([
      { op: 'move', itemId: 'nieuw1', toKitId: 'A', updateBookings: true },
      { op: 'move', itemId: 'nieuw2', toKitId: 'A', updateBookings: true },
    ])
    expect(plan.steps.every(touchesBookings)).toBe(true)
    expect(plan).toMatchObject({ target: 'FX3 A (groene labels)', verb: 'Toegevoegd aan', names: { nieuw1: 'Sony batterij #5' } })
  })

  it('ongedaan maken: de nieuwe items worden weer los', () => {
    expect(invertPlan(catalog, plan.steps)).toEqual([
      { op: 'move', itemId: 'nieuw2', toKitId: null, updateBookings: false },
      { op: 'move', itemId: 'nieuw1', toKitId: null, updateBookings: false },
    ])
  })

  it('de voorvertoning zet het nieuwe item in de komende boekingen van de kit, waar het vrij is', () => {
    const booking = (id: string, lines: [string, string | null][], start: string, end: string) => ({
      id, start_date: start, end_date: end, lines: lines.map(([item_id, via]) => ({ item_id, via_kit_id: via, via_kit_name: via })),
      booked_for_user_id: null, freelancer_id: null, external_name: null, person_name: 'Bram', client: null, project: null,
      note: null, created_by: null, created_by_name: 'x',
    })
    const p = previewMove('nieuw1', null, 'A', [
      booking('komt', [['bodyA', 'A']], '2026-11-20', '2026-11-21'),
      booking('loopt', [['bodyA', 'A']], '2026-11-02', '2026-11-04'),
    ], '2026-11-03')
    expect(p.add.map(s => [s.booking.id, s.ok])).toEqual([['komt', true]])
    expect(p.remove).toEqual([])
  })
})

describe('planDrop: dropregels', () => {
  it('onderdeel naar een andere kit (of een onderdeel daarvan): verplaatsen, boekingen mee', () => {
    const p = planDrop(catalog, { type: 'item', id: 'lensA' }, { type: 'item', id: 'bodyB' })!
    expect(p.steps).toEqual([{ op: 'move', itemId: 'lensA', toKitId: 'B', updateBookings: true }])
    expect(p.target).toBe('FX3 B (wit label)')
  })

  it('onderdeel binnen dezelfde kit: alleen volgorde', () => {
    expect(planDrop(catalog, { type: 'item', id: 'batA' }, { type: 'item', id: 'bodyA' })!.steps)
      .toEqual([{ op: 'partOrder', kitId: 'A', ids: ['batA', 'bodyA', 'lensA'] }])
  })

  it('onderdeel op een categorie: uit de kit, los in die categorie', () => {
    expect(planDrop(catalog, { type: 'item', id: 'lensA' }, { type: 'category', id: 'bat' })!.steps).toEqual([
      { op: 'move', itemId: 'lensA', toKitId: null, updateBookings: true },
      { op: 'itemCategory', itemId: 'lensA', categoryId: 'bat' },
    ])
    // Al in die categorie: alleen uit de kit.
    expect(planDrop(catalog, { type: 'item', id: 'batA' }, { type: 'item', id: 'bat3' })!.steps)
      .toEqual([{ op: 'move', itemId: 'batA', toKitId: null, updateBookings: true }])
  })

  it('los item op een kit: in de kit', () => {
    expect(planDrop(catalog, { type: 'item', id: 'bat3' }, { type: 'kit', id: 'A' })!.steps)
      .toEqual([{ op: 'move', itemId: 'bat3', toKitId: 'A', updateBookings: true }])
  })

  it('los item naar een andere categorie, of binnen de categorie van plek', () => {
    expect(planDrop(catalog, { type: 'item', id: 'fs7' }, { type: 'category', id: 'drone' })!.steps)
      .toEqual([{ op: 'itemCategory', itemId: 'fs7', categoryId: 'drone' }])
    expect(planDrop(catalog, { type: 'item', id: 'bat4' }, { type: 'item', id: 'bat3' })!.steps)
      .toEqual([{ op: 'itemOrder', ids: ['bat4', 'bat3'] }])
  })

  it('kit naar een andere categorie, of binnen de categorie van plek', () => {
    expect(planDrop(catalog, { type: 'kit', id: 'B' }, { type: 'item', id: 'bat3' })!.steps)
      .toEqual([{ op: 'kitCategory', kitId: 'B', categoryId: 'bat' }])
    expect(planDrop(catalog, { type: 'kit', id: 'B' }, { type: 'kit', id: 'A' })!.steps)
      .toEqual([{ op: 'kitOrder', ids: ['B', 'A'] }])
  })

  it('categorie op een categorie (of iets daarin): volgorde', () => {
    expect(planDrop(catalog, { type: 'category', id: 'bat' }, { type: 'item', id: 'fs7' })!.steps)
      .toEqual([{ op: 'categoryOrder', ids: ['bat', 'video', 'drone'] }])
  })

  it('niets te doen: op zichzelf, of los item op zijn eigen categorie', () => {
    expect(planDrop(catalog, { type: 'item', id: 'fs7' }, { type: 'item', id: 'fs7' })).toBeNull()
    expect(planDrop(catalog, { type: 'item', id: 'fs7' }, { type: 'category', id: 'video' })).toBeNull()
    expect(planDrop(catalog, { type: 'kit', id: 'A' }, { type: 'category', id: 'video' })).toBeNull()
  })

  it('"Verplaats naar…" volgt dezelfde regels', () => {
    expect(planMoveTo(catalog, 'bat3', { kitId: 'B' })!.steps).toEqual([{ op: 'move', itemId: 'bat3', toKitId: 'B', updateBookings: true }])
    expect(planMoveTo(catalog, 'lensA', { categoryId: 'video' })!.steps).toEqual([{ op: 'move', itemId: 'lensA', toKitId: null, updateBookings: true }])
  })

  it('omhoog/omlaag zonder slepen', () => {
    expect(planShift(catalog, { type: 'item', id: 'lensA' }, -1)!.steps).toEqual([{ op: 'partOrder', kitId: 'A', ids: ['lensA', 'bodyA', 'batA'] }])
    expect(planShift(catalog, { type: 'kit', id: 'A' }, -1)).toBeNull()       // al bovenaan
    expect(planShift(catalog, { type: 'category', id: 'video' }, 1)!.steps).toEqual([{ op: 'categoryOrder', ids: ['drone', 'video', 'bat'] }])
  })

  it('alleen verhuizen tussen kits heeft een voorvertoning van boekingen nodig', () => {
    expect(touchesBookings({ op: 'move', itemId: 'x', toKitId: 'A', updateBookings: true })).toBe(true)
    expect(touchesBookings({ op: 'move', itemId: 'x', toKitId: 'A', updateBookings: false })).toBe(false)
    expect(touchesBookings({ op: 'itemCategory', itemId: 'x', categoryId: 'y' })).toBe(false)
  })
})

describe('ongedaan maken', () => {
  it('onderdeel terug naar zijn oude kit, zonder de boekingen nog eens te wijzigen', () => {
    const p = planDrop(catalog, { type: 'item', id: 'lensA' }, { type: 'kit', id: 'B' })!
    expect(invertPlan(catalog, p.steps)).toEqual([{ op: 'move', itemId: 'lensA', toKitId: 'A', updateBookings: false }])
  })

  it('uit de kit + andere categorie: eerst de categorie terug, dan terug in de kit', () => {
    const p = planDrop(catalog, { type: 'item', id: 'lensA' }, { type: 'category', id: 'bat' })!
    expect(invertPlan(catalog, p.steps)).toEqual([
      { op: 'itemCategory', itemId: 'lensA', categoryId: 'video' },
      { op: 'move', itemId: 'lensA', toKitId: 'A', updateBookings: false },
    ])
  })

  it('los item in een kit: terug los', () => {
    const p = planDrop(catalog, { type: 'item', id: 'bat3' }, { type: 'kit', id: 'A' })!
    expect(invertPlan(catalog, p.steps)).toEqual([{ op: 'move', itemId: 'bat3', toKitId: null, updateBookings: false }])
  })

  it('volgordes en categorieën terug zoals ze waren', () => {
    expect(invertPlan(catalog, planDrop(catalog, { type: 'kit', id: 'B' }, { type: 'kit', id: 'A' })!.steps))
      .toEqual([{ op: 'kitOrder', ids: ['A', 'B'] }])
    expect(invertPlan(catalog, planDrop(catalog, { type: 'kit', id: 'B' }, { type: 'category', id: 'drone' })!.steps))
      .toEqual([{ op: 'kitCategory', kitId: 'B', categoryId: 'video' }])
    expect(invertPlan(catalog, planDrop(catalog, { type: 'category', id: 'bat' }, { type: 'category', id: 'video' })!.steps))
      .toEqual([{ op: 'categoryOrder', ids: ['video', 'drone', 'bat'] }])
    expect(invertPlan(catalog, planDrop(catalog, { type: 'item', id: 'batA' }, { type: 'item', id: 'bodyA' })!.steps))
      .toEqual([{ op: 'partOrder', kitId: 'A', ids: ['bodyA', 'lensA', 'batA'] }])
  })

  it('noemt de boekingen die niet automatisch terugdraaien', () => {
    expect(undoLeftovers([
      { booking_id: 'b1', start_date: '2026-11-13', end_date: '2026-11-15', action: 'weggehaald', label: 'Bram Kreike' },
      { booking_id: 'b2', start_date: '2026-11-20', end_date: '2026-11-20', action: 'toegevoegd', label: 'NoStrezz' },
    ])).toEqual([
      'Bram Kreike (2026-11-13 – 2026-11-15) blijft zonder dit onderdeel',
      'NoStrezz (2026-11-20) houdt dit onderdeel',
    ])
  })
})

describe('categoryContents', () => {
  it('kits, losse items en onderdelen in kits van een andere categorie', () => {
    const v = categoryContents(catalog, 'video')
    expect(v.kits.map(k => k.id)).toEqual(['A', 'B'])
    expect(v.loose.map(i => i.id)).toEqual(['fs7'])
    expect(v.partsElsewhere).toEqual([])        // bodyA, lensA, bodyB zitten in kits van Video zelf
    expect([v.count, v.empty]).toEqual([3, false])
  })

  it('een onderdeel in een kit elders telt mee, ook als er verder niets los staat', () => {
    const b = categoryContents(catalog, 'bat')
    expect(b.kits).toEqual([])
    expect(b.loose.map(i => i.id)).toEqual(['bat3', 'bat4'])
    expect(b.partsElsewhere.map(i => i.id)).toEqual(['batA'])
    const onlyPart = { ...catalog, items: catalog.items.filter(i => i.id !== 'bat3' && i.id !== 'bat4') }
    expect(categoryContents(onlyPart, 'bat')).toMatchObject({ count: 1, empty: false })
  })

  it('leeg', () => {
    expect(categoryContents(catalog, 'drone')).toMatchObject({ count: 0, empty: true })
  })
})
