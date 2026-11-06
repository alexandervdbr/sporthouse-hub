import { describe, it, expect } from 'vitest'
import {
  TIME_OPTIONS, bookingSlot, dayFraction, dayFullyBusy, freeGaps, gapTimes, isValidTime, normalizeTime, slotDays, slotLabel, slotsOverlap, suggestTimes,
} from '@/lib/gear/times'

// Uren als Brusselse kloktijd in tekst: geen Date, geen UTC. De klassieke
// fouten: een overdracht die als botsing telt, middernacht aan het einde van
// een dag, maand- en jaargrenzen, en de wisseldagen (29 maart en 25 oktober
// 2026, 28 maart en 31 oktober 2027).

describe('uren kiezen', () => {
  it('per kwartier van 06:00 tot 23:45', () => {
    expect(TIME_OPTIONS[0]).toBe('06:00')
    expect(TIME_OPTIONS.at(-1)).toBe('23:45')
    expect(TIME_OPTIONS).toHaveLength(72)
    expect(isValidTime('10:15')).toBe(true)
    expect(isValidTime(null)).toBe(true)
    expect(isValidTime('10:10')).toBe(false)
    expect(isValidTime('05:45')).toBe(false)
    expect(isValidTime('02:30')).toBe(false) // het nachtuur van een wisseldag kan je nooit kiezen
  })
  it('uit de database (HH:MM:SS) naar HH:MM', () => {
    expect(normalizeTime('10:00:00')).toBe('10:00')
    expect(normalizeTime(null)).toBeNull()
  })
})

describe('bookingSlot', () => {
  it('zonder uren: de hele dag, tot middernacht erna', () => {
    expect(bookingSlot('2026-11-05', null, '2026-11-07', null)).toEqual({ start: '2026-11-05T00:00', end: '2026-11-08T00:00' })
  })
  it('met uren, ook over een maand- en jaargrens', () => {
    expect(bookingSlot('2026-11-30', '18:00', '2026-12-01', '09:00')).toEqual({ start: '2026-11-30T18:00', end: '2026-12-01T09:00' })
    expect(bookingSlot('2026-12-31', '20:00', '2026-12-31', null)).toEqual({ start: '2026-12-31T20:00', end: '2027-01-01T00:00' })
  })
  it('wisseldagen: kloktijd blijft kloktijd', () => {
    expect(bookingSlot('2026-03-29', '06:00', '2026-03-29', '23:45')).toEqual({ start: '2026-03-29T06:00', end: '2026-03-29T23:45' })
    expect(bookingSlot('2026-10-25', null, '2026-10-25', null)).toEqual({ start: '2026-10-25T00:00', end: '2026-10-26T00:00' })
  })
})

describe('slotsOverlap (half open)', () => {
  const tot10 = bookingSlot('2026-11-05', null, '2026-11-05', '10:00')
  it('terug om 10:00 en ophalen om 10:00: geen botsing', () => {
    expect(slotsOverlap(tot10, bookingSlot('2026-11-05', '10:00', '2026-11-05', '14:00'))).toBe(false)
  })
  it('een kwartier eerder: wel', () => {
    expect(slotsOverlap(tot10, bookingSlot('2026-11-05', '09:45', '2026-11-05', '14:00'))).toBe(true)
  })
  it('hele dag tegen een uur op die dag: wel; de dag erna: niet', () => {
    const heleDag = bookingSlot('2026-11-05', null, '2026-11-05', null)
    expect(slotsOverlap(heleDag, bookingSlot('2026-11-05', '22:00', '2026-11-05', '23:45'))).toBe(true)
    expect(slotsOverlap(heleDag, bookingSlot('2026-11-06', null, '2026-11-06', '06:00'))).toBe(false)
  })
  it('over de wisselnacht: 20:00 → 06:00 tegen 06:00 → …', () => {
    expect(slotsOverlap(bookingSlot('2027-03-27', '20:00', '2027-03-28', '06:00'), bookingSlot('2027-03-28', '06:00', '2027-03-28', null))).toBe(false)
  })
})

describe('vrije stukken van een dag', () => {
  const day = '2026-11-05'
  const busy = [bookingSlot('2026-11-03', null, day, '10:00'), bookingSlot(day, '14:00', '2026-11-07', null)]
  it('tussen een boeking tot 10:00 en een vanaf 14:00', () => {
    expect(freeGaps(day, busy)).toEqual([{ start: `${day}T10:00`, end: `${day}T14:00` }])
    expect(dayFullyBusy(day, busy)).toBe(false)
  })
  it('een volle dag heeft geen vrij stuk', () => {
    expect(dayFullyBusy('2026-11-06', busy)).toBe(true)
    expect(dayFullyBusy(day, [...busy, bookingSlot(day, '10:00', day, '14:00')])).toBe(true)
  })
  it('een lege dag is helemaal vrij', () => {
    expect(freeGaps('2026-11-10', busy)).toEqual([{ start: '2026-11-10T00:00', end: '2026-11-11T00:00' }])
  })
  it('vrij stuk als uren voor het formulier', () => {
    expect(gapTimes({ start: `${day}T10:00`, end: `${day}T14:00` }, day)).toEqual({ startTime: '10:00', endTime: '14:00' })
    expect(gapTimes({ start: `${day}T14:00`, end: '2026-11-06T00:00' }, day)).toEqual({ startTime: '14:00', endTime: null })
  })
  it('fractie van de dag voor de balken', () => {
    expect(dayFraction(`${day}T12:00`, day)).toBe(0.5)
    expect(dayFraction('2026-11-06T00:00', day)).toBe(1)
    expect(dayFraction('2026-11-04T18:00', day)).toBe(0)
  })
})

describe('suggestTimes (klik of sleep)', () => {
  const tot10 = bookingSlot('2026-11-04', null, '2026-11-05', '10:00')
  const vanaf14 = bookingSlot('2026-11-07', '14:00', '2026-11-08', null)
  it('klik op een dag die tot 10:00 weg is: ophalen om 10:00', () => {
    expect(suggestTimes('2026-11-05', '2026-11-05', [tot10])).toEqual({ startTime: '10:00', endTime: null, conflicts: [] })
  })
  it('klik op een dag met tot 10:00 én vanaf 14:00: 10:00–14:00', () => {
    const later = bookingSlot('2026-11-05', '14:00', '2026-11-05', '18:00')
    expect(suggestTimes('2026-11-05', '2026-11-05', [tot10, later])).toEqual({ startTime: '10:00', endTime: '14:00', conflicts: [] })
  })
  it('sleep over meerdere dagen: ophalen na de eerste, terugbrengen vóór de laatste', () => {
    expect(suggestTimes('2026-11-05', '2026-11-07', [tot10, vanaf14])).toEqual({ startTime: '10:00', endTime: '14:00', conflicts: [] })
  })
  it('iets midden in de periode: precies dat stuk botst', () => {
    const midden = bookingSlot('2026-11-06', '12:00', '2026-11-06', '13:00')
    expect(suggestTimes('2026-11-05', '2026-11-07', [tot10, midden, vanaf14]).conflicts).toEqual([midden])
  })
  it('een volle dag: geen uren, en de boeking die in de weg zit', () => {
    const heel = bookingSlot('2026-11-05', null, '2026-11-05', null)
    expect(suggestTimes('2026-11-05', '2026-11-05', [heel])).toEqual({ startTime: null, endTime: null, conflicts: [heel] })
  })
  it('alles vrij: hele dagen', () => {
    expect(suggestTimes('2026-11-30', '2026-12-02', [])).toEqual({ startTime: null, endTime: null, conflicts: [] })
  })
})

describe('slotLabel', () => {
  const day = '2026-11-05'
  it('vanuit één dag', () => {
    expect(slotLabel(bookingSlot('2026-11-03', null, day, '10:00'), day)).toBe('tot 10:00')
    expect(slotLabel(bookingSlot(day, '14:00', '2026-11-07', null), day)).toBe('vanaf 14:00')
    expect(slotLabel(bookingSlot(day, '10:00', day, '14:00'), day)).toBe('10:00–14:00')
    expect(slotLabel(bookingSlot('2026-11-03', null, '2026-11-07', null), day)).toBe('hele dag')
  })
  it('als geheel', () => {
    expect(slotLabel(bookingSlot(day, null, day, '10:00'))).toBe('5 nov tot 10:00')
    expect(slotLabel(bookingSlot(day, '14:00', '2026-11-07', '10:00'))).toBe('5 nov 14:00 – 7 nov 10:00')
    expect(slotLabel(bookingSlot('2026-10-31', null, '2026-11-02', null))).toBe('31 okt – 2 nov')
  })
  it('dagen die een bezetting raakt (middernacht aan het einde telt niet mee)', () => {
    expect(slotDays(bookingSlot(day, '14:00', '2026-11-06', null))).toEqual([day, '2026-11-06'])
    expect(slotDays(bookingSlot(day, null, day, null))).toEqual([day])
  })
})
