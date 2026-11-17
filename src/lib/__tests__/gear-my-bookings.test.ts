import { describe, expect, it } from 'vitest'
import { FILTER_GROUPS, GROUP_HEADING, dayWord, groupByPerson, materialShort, samePeriodClusters, shortPeriod } from '@/lib/gear/my-bookings'
import type { GearBooking } from '@/lib/gear/types'

const today = '2026-11-17'
const p = (start_date: string, end_date: string, start_time: string | null = null, end_time: string | null = null) =>
  ({ start_date, end_date, start_time, end_time })

describe('shortPeriod', () => {
  it('vandaag met uren', () => expect(shortPeriod(p(today, today, '09:00', '22:45'), today)).toBe('Vandaag 09:00 → 22:45'))
  it('morgen, hele dag', () => expect(shortPeriod(p('2026-11-18', '2026-11-18'), today)).toBe('Morgen'))
  it('meerdere dagen in één maand', () => expect(shortPeriod(p('2026-11-20', '2026-11-23'), today)).toBe('20–23 nov'))
  it('over een maandgrens', () => expect(shortPeriod(p('2026-11-28', '2026-12-02'), today)).toBe('28 nov – 2 dec'))
  it('van vandaag tot later, met uren', () => expect(shortPeriod(p(today, '2026-11-20', '14:00', '10:00'), today)).toBe('Vandaag 14:00 → 20 nov 10:00'))
  it('van gisteren tot morgen, hele dagen', () => expect(shortPeriod(p('2026-11-16', '2026-11-18'), today)).toBe('Gisteren → Morgen'))
  it('alleen een ophaal- of terugbrenguur', () => {
    expect(shortPeriod(p('2026-11-18', '2026-11-18', '09:00'), today)).toBe('Morgen vanaf 09:00')
    expect(shortPeriod(p('2026-11-18', '2026-11-18', null, '18:00'), today)).toBe('Morgen tot 18:00')
  })
  it('dagwoorden', () => {
    expect(dayWord('2026-11-16', today)).toBe('Gisteren')
    expect(dayWord('2026-12-01', today)).toBe('1 dec')
    expect(dayWord('2027-01-01', '2026-12-31')).toBe('Morgen')
  })
})

describe('materialShort', () => {
  it('twee namen voluit, meer met +N; de volledige lijst voor de tooltip', () => {
    expect(materialShort(['A', 'B'])).toEqual({ short: 'A, B', full: 'A, B' })
    expect(materialShort(['A', 'B', 'C', 'D', 'E'])).toEqual({ short: 'A, B +3', full: 'A, B, C, D, E' })
    expect(materialShort([]).short).toBe('Geen materiaal')
  })
})

describe('labels', () => {
  it('correct Nederlands, nergens "mij"', () => {
    expect(Object.values(GROUP_HEADING)).toEqual(['Lopend', 'Gepland', 'Afgelopen'])
    expect(Object.values(GROUP_HEADING).join(' ').toLowerCase()).not.toContain('mij')
  })
  it('standaard lopend en gepland samen', () => {
    expect(FILTER_GROUPS.komend).toEqual(['nu', 'binnenkort'])
    expect(FILTER_GROUPS.afgelopen).toEqual(['voorbij'])
  })
})

const bk = (id: string, who: string, start: string, end: string, st: string | null = null, et: string | null = null) =>
  ({ id, person_name: who, start_date: start, end_date: end, start_time: st, end_time: et }) as unknown as GearBooking
const holder = (b: GearBooking) => ({ key: b.person_name ?? '', label: b.person_name ?? '' })

describe('Alle boekingen per persoon', () => {
  it('één groep per persoon, op volgorde van de eerste periode', () => {
    const g = groupByPerson([
      bk('1', 'Rane', '2026-11-25', '2026-11-25'),
      bk('2', 'Bram', '2026-11-20', '2026-11-20'),
      bk('3', 'Rane', '2026-11-19', '2026-11-19'),
    ], holder)
    expect(g.map(x => `${x.label}:${x.bookings.length}`)).toEqual(['Rane:2', 'Bram:1'])
  })
  it('afgelopen: de recentste persoon eerst', () => {
    const g = groupByPerson([bk('1', 'Rane', '2026-11-01', '2026-11-01'), bk('2', 'Bram', '2026-11-10', '2026-11-10')], holder, true)
    expect(g.map(x => x.label)).toEqual(['Bram', 'Rane'])
  })
  it('hint voor samenvoegen: alleen exact dezelfde periode, twee of meer', () => {
    const c = samePeriodClusters([
      bk('1', 'Rane', '2026-11-20', '2026-11-21', '10:00', '18:00'),
      bk('2', 'Rane', '2026-11-20', '2026-11-21', '10:00', '18:00'),
      bk('3', 'Rane', '2026-11-20', '2026-11-21', '10:00', '18:15'),
      bk('4', 'Rane', '2026-11-25', '2026-11-25'),
    ])
    expect(c.map(x => x.map(b => b.id))).toEqual([['1', '2']])
  })
})
