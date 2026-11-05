import { describe, it, expect } from 'vitest'
import { weekdayIndex } from '@/lib/gear/dates'
import { isoWeek, parseViewParams, periodLabel, shiftView, showsToday, viewLabel, viewRange, weekStart } from '@/lib/gear/views'

// Weken beginnen op maandag. De klassieke fouten: een week over een maand- of
// jaargrens, weeknummer 53, en de klokwissel (25 oktober 2026 en 28 maart
// 2027 zijn zondagen) die een dag kan doen verspringen.

describe('weekdayIndex / weekStart', () => {
  it('maandag is 0, zondag 6', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0)
    expect(weekdayIndex('2026-11-08')).toBe(6)
  })
  it('een zondag hoort bij de week die op maandag ervoor begon', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
  })
})

describe('viewRange', () => {
  it('dag: alleen die dag', () => {
    expect(viewRange('day', '2026-11-05')).toEqual({ start: '2026-11-05', end: '2026-11-05' })
  })
  it('week over een maandgrens', () => {
    expect(viewRange('week', '2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' })
  })
  it('week over een jaargrens', () => {
    expect(viewRange('week', '2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })
  it('weken met de klokwissel hebben gewoon 7 dagen', () => {
    expect(viewRange('week', '2026-10-25')).toEqual({ start: '2026-10-19', end: '2026-10-25' })
    expect(viewRange('week', '2027-03-28')).toEqual({ start: '2027-03-22', end: '2027-03-28' })
    expect(viewRange('week', '2027-03-29')).toEqual({ start: '2027-03-29', end: '2027-04-04' })
  })
  it('maand, ook februari in een schrikkeljaar', () => {
    expect(viewRange('month', '2026-11-17')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(viewRange('month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
})

describe('isoWeek', () => {
  it('week 45 van 2026', () => expect(isoWeek('2026-11-05')).toBe(45))
  it('2026 heeft een week 53, die doorloopt in 2027', () => {
    expect(isoWeek('2026-12-31')).toBe(53)
    expect(isoWeek('2027-01-03')).toBe(53)
    expect(isoWeek('2027-01-04')).toBe(1)
  })
  it('eind december kan al in week 1 van het volgende jaar vallen', () => {
    expect(isoWeek('2025-12-29')).toBe(1) // maandag van week 1 van 2026
    expect(isoWeek('2026-01-01')).toBe(1)
  })
})

describe('shiftView', () => {
  it('dag en week over maand- en jaargrenzen', () => {
    expect(shiftView('day', '2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftView('week', '2026-10-22', 1)).toBe('2026-10-29')
    expect(shiftView('week', '2027-01-02', -1)).toBe('2026-12-26')
  })
  it('maand: dezelfde dag, of de laatste als die niet bestaat', () => {
    expect(shiftView('month', '2026-11-05', 1)).toBe('2026-12-05')
    expect(shiftView('month', '2026-12-15', 1)).toBe('2027-01-15')
    expect(shiftView('month', '2027-01-31', 1)).toBe('2027-02-28')
    expect(shiftView('month', '2026-01-10', -1)).toBe('2025-12-10')
  })
})

describe('labels', () => {
  it('kop per weergave', () => {
    expect(viewLabel('day', '2026-11-05')).toBe('Do 5 november 2026')
    expect(viewLabel('week', '2026-11-05')).toBe('Week 45 · 2–8 nov 2026')
    expect(viewLabel('month', '2026-11-05')).toBe('November 2026')
  })
  it('week over een maand- en een jaargrens', () => {
    expect(viewLabel('week', '2026-10-29')).toBe('Week 44 · 26 okt – 1 nov 2026')
    expect(viewLabel('week', '2027-01-01')).toBe('Week 53 · 28 dec 2026 – 3 jan 2027')
  })
  it('periode van een boeking', () => {
    expect(periodLabel('2026-11-03', '2026-11-07')).toBe('3–7 nov')
    expect(periodLabel('2026-11-05', '2026-11-05')).toBe('5 nov')
    expect(periodLabel('2026-10-28', '2026-11-02')).toBe('28 okt – 2 nov')
    expect(periodLabel('2026-12-30', '2027-01-02')).toBe('30 dec 2026 – 2 jan 2027')
  })
})

describe('showsToday / parseViewParams', () => {
  it('vandaag in beeld per weergave', () => {
    expect(showsToday('week', '2026-11-08', '2026-11-02')).toBe(true)
    expect(showsToday('week', '2026-11-09', '2026-11-08')).toBe(false)
    expect(showsToday('day', '2026-11-04', '2026-11-05')).toBe(false)
  })
  it('neemt geldige waarden uit de URL, anders de terugval', () => {
    expect(parseViewParams({ view: 'month', date: '2026-12-01' }, 'week', '2026-11-05')).toEqual({ view: 'month', date: '2026-12-01' })
    expect(parseViewParams({ view: 'jaar', date: '2026-02-30' }, 'day', '2026-11-05')).toEqual({ view: 'day', date: '2026-11-05' })
    expect(parseViewParams({}, 'week', '2026-11-05')).toEqual({ view: 'week', date: '2026-11-05' })
  })
})
