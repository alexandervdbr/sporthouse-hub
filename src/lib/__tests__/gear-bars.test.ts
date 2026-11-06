import { describe, it, expect } from 'vitest'
import { buildBars, rangeFromSelection } from '@/lib/gear/bars'
import { monthDays } from '@/lib/gear/dates'

const november = { start: '2026-11-01', end: '2026-11-30' }

describe('buildBars', () => {
  it('zet een boeking binnen de maand op de juiste kolommen', () => {
    expect(buildBars([{ bookingId: 'b1', range: { start: '2026-11-03', end: '2026-11-05' }, cancelled: false }], november))
      .toEqual([{ bookingId: 'b1', startIndex: 2, span: 3, continuesBefore: false, continuesAfter: false, startFrac: 0, endFrac: 1 }])
  })

  it('knipt een boeking die in de vorige maand begon', () => {
    expect(buildBars([{ bookingId: 'b1', range: { start: '2026-10-28', end: '2026-11-02' }, cancelled: false }], november))
      .toEqual([{ bookingId: 'b1', startIndex: 0, span: 2, continuesBefore: true, continuesAfter: false, startFrac: 0, endFrac: 1 }])
  })

  it('knipt een boeking die doorloopt in de volgende maand', () => {
    expect(buildBars([{ bookingId: 'b1', range: { start: '2026-11-29', end: '2026-12-03' }, cancelled: false }], november))
      .toEqual([{ bookingId: 'b1', startIndex: 28, span: 2, continuesBefore: false, continuesAfter: true, startFrac: 0, endFrac: 1 }])
  })

  it('tekent een boeking die de hele maand overspant als één balk', () => {
    expect(buildBars([{ bookingId: 'b1', range: { start: '2026-10-01', end: '2026-12-31' }, cancelled: false }], november))
      .toEqual([{ bookingId: 'b1', startIndex: 0, span: 30, continuesBefore: true, continuesAfter: true, startFrac: 0, endFrac: 1 }])
  })

  it('laat geannuleerde en niet-zichtbare boekingen weg', () => {
    expect(buildBars([
      { bookingId: 'weg',   range: { start: '2026-11-03', end: '2026-11-05' }, cancelled: true },
      { bookingId: 'okt',   range: { start: '2026-10-01', end: '2026-10-31' }, cancelled: false },
      { bookingId: 'dec',   range: { start: '2026-12-01', end: '2026-12-02' }, cancelled: false },
    ], november)).toEqual([])
  })

  it('sorteert op eerste kolom', () => {
    const bars = buildBars([
      { bookingId: 'later', range: { start: '2026-11-20', end: '2026-11-21' }, cancelled: false },
      { bookingId: 'eerst', range: { start: '2026-11-02', end: '2026-11-02' }, cancelled: false },
    ], november)
    expect(bars.map(b => b.bookingId)).toEqual(['eerst', 'later'])
  })

  it('telt één dag als één kolom', () => {
    expect(buildBars([{ bookingId: 'b', range: { start: '2026-11-30', end: '2026-11-30' }, cancelled: false }], november)[0])
      .toMatchObject({ startIndex: 29, span: 1 })
  })
})

describe('rangeFromSelection', () => {
  const days = monthDays(2026, 11)
  it('geeft een periode in beide sleeprichtingen', () => {
    expect(rangeFromSelection(days, 2, 5)).toEqual({ start: '2026-11-03', end: '2026-11-06' })
    expect(rangeFromSelection(days, 5, 2)).toEqual({ start: '2026-11-03', end: '2026-11-06' })
  })
  it('geeft één dag bij een klik', () => {
    expect(rangeFromSelection(days, 9, 9)).toEqual({ start: '2026-11-10', end: '2026-11-10' })
  })
  it('blijft binnen het venster', () => {
    expect(rangeFromSelection(days, -3, 40)).toEqual({ start: '2026-11-01', end: '2026-11-30' })
  })
  it('geeft null zonder dagen', () => {
    expect(rangeFromSelection([], 0, 0)).toBeNull()
  })
})

describe('buildBars met uren', () => {
  it('begint en eindigt midden in een dag: tot 10:00 en vanaf 14:00 in dezelfde dagcel', () => {
    const tot10 = { bookingId: 'a', range: { start: '2026-11-03', end: '2026-11-05' }, cancelled: false, slot: { start: '2026-11-03T00:00', end: '2026-11-05T10:00' } }
    const vanaf14 = { bookingId: 'b', range: { start: '2026-11-05', end: '2026-11-05' }, cancelled: false, slot: { start: '2026-11-05T14:00', end: '2026-11-06T00:00' } }
    const [a, b] = buildBars([tot10, vanaf14], november)
    expect(a).toMatchObject({ startIndex: 2, span: 3, startFrac: 0, endFrac: 10 / 24 })
    expect(b).toMatchObject({ startIndex: 4, span: 1, startFrac: 14 / 24, endFrac: 1 })
  })
  it('buiten het venster: de knip is een hele dag', () => {
    const [a] = buildBars([{ bookingId: 'a', range: { start: '2026-10-30', end: '2026-12-02' }, cancelled: false, slot: { start: '2026-10-30T14:00', end: '2026-12-02T10:00' } }], november)
    expect(a).toMatchObject({ startFrac: 0, endFrac: 1, continuesBefore: true, continuesAfter: true })
  })
})
