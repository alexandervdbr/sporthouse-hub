import { describe, it, expect } from 'vitest'
import { buildDayList, type DayItemEntry, type DayKitEntry } from '@/lib/gear/day-list'
import type { GearBooking, GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

const none = { responsible_client_id: null, responsible_user_id: null, responsible_name: null }
const item = (id: string, category_id: string, name: string, extra: Partial<GearItem> = {}): GearItem => ({
  id, category_id, name, model: null, number: null, serial_number: null, sort_order: 0, label_color: null, nd_size: null,
  warning: null, notes: null, status: 'ok', status_note: null, ...none, ...extra,
})
const kit = (id: string, category_id: string, name: string, item_ids: string[]): GearKit => ({
  id, category_id, name, label_color: null, warning: null, notes: null, sort_order: 0, item_ids, ...none,
})
const booking = (id: string, lines: [string, string | null][], start: string, end: string, extra: Partial<GearBooking> = {}): GearBooking => ({
  id, start_date: start, end_date: end, lines: lines.map(([item_id, via]) => ({ item_id, via_kit_id: via, via_kit_name: via })),
  booked_for_user_id: null, freelancer_id: null, external_name: null, person_name: null, client: null, project: null,
  note: null, created_by: null, created_by_name: 'x', ...extra,
})

const catalog: GearCatalog = {
  categories: [
    { id: 'video', name: 'VIDEO', color: '#3A913F', sort_order: 1 },
    { id: 'audio', name: 'AUDIO', color: '#0ea5e9', sort_order: 2 },
  ],
  items: [
    item('body', 'video', 'FX3 A'),
    item('lens', 'video', '24-70 #1'),
    item('bat', 'video', 'Batterij #1', { status: 'defect' }),
    item('mon', 'video', 'Monitor', { sort_order: 1 }),
    item('mic', 'audio', 'Rode mic'),
    item('kapot', 'audio', 'Oude mic', { sort_order: 1, status: 'uit_dienst' }),
  ],
  kits: [kit('fx3', 'video', 'FX3 A-kit', ['body', 'lens', 'bat'])],
  clients: [],
}
const day = '2026-11-05'
const bram = booking('b1', [['body', 'fx3'], ['lens', 'fx3']], '2026-11-03', '2026-11-07', {
  person_name: 'Bram Kreike', client: { id: 'c', name: 'NoStrezz', color: '#f97316' }, project: { id: 'p', name: 'Teaser' },
})
const lensElders = booking('b2', [['lens', null]], '2026-11-05', '2026-11-05', { person_name: 'Jan Peeters' })

const flat = (groups: ReturnType<typeof buildDayList>) => groups.flatMap(g => g.entries)

describe('buildDayList', () => {
  it('zelfde volgorde als het raster: per categorie eerst kits, dan losse items', () => {
    const g = buildDayList(catalog, [], day, day)
    expect(g.map(x => x.category.name)).toEqual(['VIDEO', 'AUDIO'])
    expect(g[0].entries.map(e => e.kind)).toEqual(['kit', 'item'])
  })

  it('vrij, weg met bij wie en de volledige periode, of onbeschikbaar', () => {
    const [video, audio] = buildDayList(catalog, [bram], day, day)
    const k = video.entries[0] as DayKitEntry
    expect(k.state).toBe('weg')
    expect(k.holder).toMatchObject({ text: 'Bram Kreike · NoStrezz', project: 'Teaser', start: '2026-11-03', end: '2026-11-07', color: '#f97316' })
    expect((video.entries[1] as DayItemEntry).state).toBe('vrij')
    expect(audio.entries.map(e => e.state)).toEqual(['vrij', 'onbeschikbaar'])
  })

  it('een onderdeel heeft de boeking van de kit; een defect onderdeel blijft onbeschikbaar', () => {
    const k = buildDayList(catalog, [bram], day, day)[0].entries[0] as DayKitEntry
    expect(k.parts.map(p => [p.row.item.name, p.state])).toEqual([['FX3 A', 'weg'], ['24-70 #1', 'weg'], ['Batterij #1', 'onbeschikbaar']])
  })

  it('kit: onderdelen die elders weg zijn, geteld; de kit zelf blijft vrij', () => {
    const k = buildDayList(catalog, [lensElders], day, day)[0].entries[0] as DayKitEntry
    expect(k.state).toBe('vrij')
    expect(k.partsElsewhere).toBe(1)
    expect(k.parts[1].holder?.text).toBe('Jan Peeters')
  })

  it('een boeking die net niet op die dag valt, telt niet', () => {
    const k = buildDayList(catalog, [bram], '2026-11-08', day)[0].entries[0] as DayKitEntry
    expect(k.state).toBe('vrij')
  })

  it('kit zonder enig vrij onderdeel is onbeschikbaar', () => {
    const k = buildDayList(catalog, [lensElders, booking('b3', [['body', null]], day, day)], day, day)[0].entries[0] as DayKitEntry
    expect(k.state).toBe('onbeschikbaar')
  })

  it('Alleen weg: geboekt, of een kit met een onderdeel elders; lege categorieën vallen weg', () => {
    expect(flat(buildDayList(catalog, [bram], day, day, 'out')).map(e => e.kind === 'kit' ? e.row.kit.name : e.row.item.name)).toEqual(['FX3 A-kit'])
    expect(flat(buildDayList(catalog, [lensElders], day, day, 'out')).map(e => e.kind)).toEqual(['kit'])
    expect(buildDayList(catalog, [], day, day, 'out')).toEqual([])
  })

  it('Alleen vrij: te boeken rijen, zonder defecte of uit dienst', () => {
    const names = flat(buildDayList(catalog, [bram], day, day, 'free')).map(e => e.kind === 'kit' ? e.row.kit.name : e.row.item.name)
    expect(names).toEqual(['Monitor', 'Rode mic'])
  })

  it('telt per categorie wat weg is, ook als de filter het verbergt', () => {
    expect(buildDayList(catalog, [bram], day, day, 'free')[0].out).toBe(1)
  })

  it('zoeken werkt zoals in het raster', () => {
    expect(flat(buildDayList(catalog, [], day, day, 'all', 'rode')).map(e => e.kind === 'item' && e.row.item.name)).toEqual(['Rode mic'])
  })

  it('een externe naam staat er zoals ingegeven', () => {
    const ext = booking('b4', [['mon', null]], day, day, { external_name: 'Studio X', person_name: 'Studio X' })
    const mon = buildDayList(catalog, [ext], day, day)[0].entries[1] as DayItemEntry
    expect(mon.holder?.text).toBe('Studio X')
  })
})

describe('dagweergave met uren', () => {
  const tot10 = booking('t', [['mon', null]], '2026-11-03', day, { person_name: 'Bram Kreike', end_time: '10:00' })
  const vanaf14 = booking('v', [['mon', null]], day, '2026-11-07', { person_name: 'Jan Peeters', start_time: '14:00' })
  const mon = (bs: GearBooking[], f: Parameters<typeof buildDayList>[4] = 'all') =>
    flat(buildDayList(catalog, bs, day, day, f)).find(e => e.kind === 'item' && e.row.item.name === 'Monitor') as DayItemEntry | undefined

  it('overdracht: "tot 10:00", vrij 10:00–14:00, "vanaf 14:00", in volgorde', () => {
    const e = mon([vanaf14, tot10])!
    expect(e.state).toBe('deels')
    expect(e.holders.map(h => [h.holder.text, h.holder.when])).toEqual([['Bram Kreike', 'tot 10:00'], ['Jan Peeters', 'vanaf 14:00']])
    expect(e.gaps).toEqual([{ start: `${day}T10:00`, end: `${day}T14:00` }])
  })
  it('deels weg telt bij "Alleen weg" én bij "Alleen vrij"', () => {
    expect(mon([tot10], 'out')).toBeDefined()
    expect(mon([tot10], 'free')).toBeDefined()
  })
  it('de hele dag weg: niet bij "Alleen vrij"', () => {
    const heel = booking('h', [['mon', null]], day, day, { person_name: 'X' })
    expect(mon([heel])!.state).toBe('weg')
    expect(mon([heel], 'free')).toBeUndefined()
  })
})
