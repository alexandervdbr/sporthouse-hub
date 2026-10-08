import { describe, it, expect } from 'vitest'
import {
  getWeekDates, getMonthWeeks, groupWeekByMonth, addMonths, addWeeks,
  dateCellKey, weekLabel,
} from '@/lib/planning-week'

// Datumrekenen is waar dit soort code stilletjes fout gaat: een week die over
// een maandgrens loopt, een maand die op zondag begint, een schrikkeljaar. Het
// raster laat zo'n fout niet zien — je ziet een lege cel, geen foutmelding.

describe('getWeekDates', () => {
  it('begint altijd op maandag, ook als de ankerdag een zondag is', () => {
    // 11 oktober 2026 is een zondag.
    const week = getWeekDates(new Date(2026, 9, 11))
    expect(week).toHaveLength(7)
    expect(week[0].dayName).toBe('Maandag')
    expect(week[0].day).toBe(5)
    expect(week[6].day).toBe(11)
  })

  it('geeft elke dag zijn eigen jaar en maand mee over een maandgrens heen', () => {
    // De week van 28 december 2026 loopt door tot in januari 2027.
    const week = getWeekDates(new Date(2026, 11, 30))
    expect(week[0]).toMatchObject({ year: 2026, month: 12, day: 28 })
    expect(week[6]).toMatchObject({ year: 2027, month: 1, day: 3 })
  })

  it('markeert weekends', () => {
    const week = getWeekDates(new Date(2026, 9, 5))
    expect(week.filter(d => d.isWeekend).map(d => d.day)).toEqual([10, 11])
  })
})

describe('getMonthWeeks', () => {
  it('dekt de hele maand met volledige weken', () => {
    const weeks = getMonthWeeks(2026, 10)
    expect(weeks.every(w => w.length === 7)).toBe(true)
    const days = weeks.flat().filter(d => d.year === 2026 && d.month === 10)
    expect(days).toHaveLength(31)
  })

  it('neemt de overloopdagen van de buurmaanden mee', () => {
    // Oktober 2026 begint op een donderdag, dus de eerste week begint in
    // september. Die dagen moeten erbij, anders staat de eerste rij half leeg.
    const flat = getMonthWeeks(2026, 10).flat()
    expect(flat[0]).toMatchObject({ year: 2026, month: 9, day: 28 })
  })

  it('werkt voor een februari in een schrikkeljaar', () => {
    const days = getMonthWeeks(2028, 2).flat().filter(d => d.month === 2)
    expect(days).toHaveLength(29)
  })

  it('werkt voor een maand die op maandag begint zonder lege voorloop', () => {
    // 1 juni 2026 is een maandag.
    const flat = getMonthWeeks(2026, 6).flat()
    expect(flat[0]).toMatchObject({ year: 2026, month: 6, day: 1 })
  })
})

describe('addMonths', () => {
  it('rolt niet over wanneer de doelmaand de huidige dag niet heeft', () => {
    // 31 januari + 1 maand werd met kale Date-rekenkunde 3 maart.
    const d = addMonths(new Date(2026, 0, 31), 1)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(1)
  })

  it('gaat over de jaargrens heen', () => {
    expect(addMonths(new Date(2026, 11, 15), 1).getFullYear()).toBe(2027)
    expect(addMonths(new Date(2026, 0, 15), -1).getFullYear()).toBe(2025)
  })
})

describe('addWeeks', () => {
  it('telt zeven dagen per week, ook over een maandgrens', () => {
    const d = addWeeks(new Date(2026, 9, 29), 1)
    expect(d.getMonth()).toBe(10)
    expect(d.getDate()).toBe(5)
  })
})

describe('groupWeekByMonth', () => {
  it('geeft één groep voor een week binnen één maand', () => {
    const groups = groupWeekByMonth(getWeekDates(new Date(2026, 9, 7)))
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ year: 2026, month: 10 })
    expect(groups[0].days).toHaveLength(7)
  })

  it('splitst een week die twee maanden raakt', () => {
    const groups = groupWeekByMonth(getWeekDates(new Date(2026, 11, 30)))
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.month)).toEqual([12, 1])
    expect(groups[0].days.length + groups[1].days.length).toBe(7)
  })
})

describe('dateCellKey', () => {
  it('onderscheidt dezelfde dag in verschillende jaren', () => {
    expect(dateCellKey(2026, 3, 1, 'FOS', 'Rune Stiers'))
      .not.toBe(dateCellKey(2027, 3, 1, 'FOS', 'Rune Stiers'))
  })

  it('onderscheidt naamgenoten in verschillende afdelingen', () => {
    expect(dateCellKey(2026, 3, 1, 'Stags PS', 'Thibault'))
      .not.toBe(dateCellKey(2026, 3, 1, 'STAGS Projectkant', 'Thibault'))
  })
})

describe('weekLabel', () => {
  it('noemt de maand één keer als de week er niet uit loopt', () => {
    expect(weekLabel(getWeekDates(new Date(2026, 9, 7)))).toBe('5 – 11 Okt 2026')
  })

  it('noemt beide maanden bij een maandgrens', () => {
    expect(weekLabel(getWeekDates(new Date(2026, 10, 30)))).toBe('30 Nov – 6 Dec 2026')
  })

  it('noemt beide jaren bij een jaargrens', () => {
    expect(weekLabel(getWeekDates(new Date(2026, 11, 30)))).toBe('28 Dec 2026 – 3 Jan 2027')
  })
})
