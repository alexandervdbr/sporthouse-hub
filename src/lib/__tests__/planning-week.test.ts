import { describe, it, expect } from 'vitest'
import {
  getWeekDates, getMonthWeeks, groupWeekByMonth, addMonths, addWeeks,
  dateCellKey, weekLabel, groupDeletes,
  rowToCell, cellToRowFields, isHalfDay, cellHalves, cellLabel, dayParts, formatDays,
} from '@/lib/planning-week'
import type { PlanningRow } from '@/lib/planning-cache'

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
    expect(dateCellKey(2026, 3, 1, 'rune')).not.toBe(dateCellKey(2027, 3, 1, 'rune'))
  })

  it('onderscheidt twee personen op dezelfde dag', () => {
    expect(dateCellKey(2026, 3, 1, 'thibault-1'))
      .not.toBe(dateCellKey(2026, 3, 1, 'thibault-2'))
  })

  it('verandert niet als iemand van afdeling wisselt — er zit geen afdeling in', () => {
    expect(dateCellKey(2026, 3, 1, 'rune')).toBe(dateCellKey(2026, 3, 1, 'rune'))
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

describe('groupDeletes', () => {
  it('turns cells into one group per month and person', () => {
    const groups = groupDeletes([
      { year: 2026, month: 11, day: 3, contactId: 'a' },
      { year: 2026, month: 11, day: 4, contactId: 'a' },
      { year: 2026, month: 11, day: 3, contactId: 'b' },
      { year: 2026, month: 12, day: 1, contactId: 'a' },
    ])
    expect(groups).toEqual([
      { year: 2026, month: 11, contactId: 'a', days: [3, 4] },
      { year: 2026, month: 11, contactId: 'b', days: [3] },
      { year: 2026, month: 12, contactId: 'a', days: [1] },
    ])
  })

  it('does not repeat a day that was passed twice', () => {
    expect(groupDeletes([
      { year: 2026, month: 1, day: 5, contactId: 'a' },
      { year: 2026, month: 1, day: 5, contactId: 'a' },
    ])).toEqual([{ year: 2026, month: 1, contactId: 'a', days: [5] }])
  })

  it('returns nothing for nothing', () => {
    expect(groupDeletes([])).toEqual([])
  })
})

const rij = (extra: Partial<PlanningRow> = {}): PlanningRow => ({
  year: 2026, month: 11, day: 3, contact_id: 'a', value: 'RECUP',
  bold: true, text_color: '#ffffff', bg_color: '#f59e0b', note: null,
  updated_by: null, updated_at: null, ...extra,
})

describe('halve dagen', () => {
  it('leest een rij zonder namiddag als een hele dag', () => {
    const cel = rowToCell(rij())
    expect(isHalfDay(cel)).toBe(false)
    expect(cellHalves(cel)).toHaveLength(1)
    expect(cellLabel(cel)).toBe('RECUP')
  })

  it('leest een rij uit een oude browserkopie, zonder de nieuwe kolommen', () => {
    const oud = rij()
    delete oud.value_pm
    expect(isHalfDay(rowToCell(oud))).toBe(false)
  })

  it('leest een namiddag als een halve dag', () => {
    const cel = rowToCell(rij({ value_pm: 'PS', bg_color_pm: '#2563eb' }))
    expect(isHalfDay(cel)).toBe(true)
    expect(cellHalves(cel).map(h => h.value)).toEqual(['RECUP', 'PS'])
    expect(cellHalves(cel)[1].bgColor).toBe('#2563eb')
    expect(cellLabel(cel)).toBe('VM RECUP · NM PS')
  })

  it('ziet een lege namiddag niet als halve dag', () => {
    expect(isHalfDay(rowToCell(rij({ value_pm: '  ' })))).toBe(false)
  })

  it('schrijft een hele dag met een lege namiddag, zodat een gesplitste dag weer heel wordt', () => {
    const velden = cellToRowFields({ ...rowToCell(rij()), pm: null })
    expect(velden).toMatchObject({ value: 'RECUP', value_pm: null, text_color_pm: null, bg_color_pm: null })
  })

  it('schrijft en leest een halve dag zonder iets te verliezen', () => {
    const cel = rowToCell(rij({ value_pm: 'PS - THUIS', text_color_pm: '#ffffff', bg_color_pm: '#1d4ed8', note: 'tot 12u' }))
    const terug = rowToCell(rij(cellToRowFields(cel)))
    expect(terug.pm).toEqual(cel.pm)
    expect(terug.note).toBe('tot 12u')
  })
})

describe('dayParts', () => {
  it('telt een hele dag als 1', () => {
    expect(dayParts('VERLOF', null)).toEqual([{ value: 'VERLOF', weight: 1 }])
  })

  it('telt elke helft van een halve dag als 0,5', () => {
    expect(dayParts('VERLOF', 'PS')).toEqual([
      { value: 'VERLOF', weight: 0.5 },
      { value: 'PS', weight: 0.5 },
    ])
  })

  it('telt twee keer dezelfde helft als één hele dag', () => {
    expect(dayParts('ZIEK', 'ZIEK')).toEqual([{ value: 'ZIEK', weight: 1 }])
  })
})

describe('formatDays', () => {
  it('toont halve dagen met een komma', () => {
    expect(formatDays(2.5)).toBe('2,5')
    expect(formatDays(3)).toBe('3')
  })
})
