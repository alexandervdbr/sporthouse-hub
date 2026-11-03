import { describe, it, expect } from 'vitest'
import { addDays, diffDays, eachDay, isISODate, isWeekend, monthDays, todayInBrussels } from '@/lib/gear/dates'

// Hele dagen zonder uren: de klassieke fouten zijn maandgrenzen, schrikkeljaren
// en de wissel naar zomer-/wintertijd — die laatste verschoof in de oude
// planner reservaties met een uur.

describe('isISODate', () => {
  it('aanvaardt bestaande dagen', () => {
    expect(isISODate('2026-11-03')).toBe(true)
    expect(isISODate('2028-02-29')).toBe(true)
  })
  it('weigert onbestaande dagen en andere vormen', () => {
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('2026-11-3')).toBe(false)
    expect(isISODate('03/11/2026')).toBe(false)
    expect(isISODate('')).toBe(false)
  })
})

describe('addDays / diffDays', () => {
  it('loopt over maand- en jaargrenzen', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('verschuift niet rond de klokwissel', () => {
    // 25 oktober 2026 en 28 maart 2027 zijn de wisseldagen in België.
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29')
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
    expect(diffDays('2027-03-27', '2027-03-29')).toBe(2)
  })
  it('geeft 0 voor dezelfde dag en negatief achteruit', () => {
    expect(diffDays('2026-11-03', '2026-11-03')).toBe(0)
    expect(diffDays('2026-11-05', '2026-11-03')).toBe(-2)
  })
})

describe('eachDay', () => {
  it('neemt begin en einde mee', () => {
    expect(eachDay('2026-11-03', '2026-11-05')).toEqual(['2026-11-03', '2026-11-04', '2026-11-05'])
  })
  it('is één dag als begin en einde gelijk zijn', () => {
    expect(eachDay('2026-11-03', '2026-11-03')).toEqual(['2026-11-03'])
  })
  it('is leeg als het einde vóór het begin ligt', () => {
    expect(eachDay('2026-11-05', '2026-11-03')).toEqual([])
  })
})

describe('monthDays', () => {
  it('kent de lengte van elke maand', () => {
    expect(monthDays(2026, 11)).toHaveLength(30)
    expect(monthDays(2026, 12)).toHaveLength(31)
    expect(monthDays(2026, 2)).toHaveLength(28)
    expect(monthDays(2028, 2)).toHaveLength(29)
  })
  it('begint op de 1e en eindigt op de laatste', () => {
    const d = monthDays(2026, 10)
    expect(d[0]).toBe('2026-10-01')
    expect(d[d.length - 1]).toBe('2026-10-31')
  })
})

describe('isWeekend', () => {
  it('herkent zaterdag en zondag', () => {
    expect(isWeekend('2026-11-07')).toBe(true)  // zaterdag
    expect(isWeekend('2026-11-08')).toBe(true)  // zondag
    expect(isWeekend('2026-11-09')).toBe(false) // maandag
  })
})

describe('todayInBrussels', () => {
  it('neemt de Belgische dag, niet die van UTC', () => {
    // 23:30 UTC op 3 november is al 4 november in Brussel.
    expect(todayInBrussels(new Date('2026-11-03T23:30:00Z'))).toBe('2026-11-04')
    expect(todayInBrussels(new Date('2026-11-03T10:00:00Z'))).toBe('2026-11-03')
  })
})
