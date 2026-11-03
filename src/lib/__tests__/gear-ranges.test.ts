import { describe, it, expect } from 'vitest'
import {
  validateRange, rangeLength, rangesOverlap, intersectRanges,
  findConflicts, conflictDays, type BookedUnit,
} from '@/lib/gear/ranges'

describe('validateRange', () => {
  it('aanvaardt één dag en meerdere dagen', () => {
    expect(validateRange({ start: '2026-11-03', end: '2026-11-03' })).toBeNull()
    expect(validateRange({ start: '2026-11-03', end: '2026-11-10' })).toBeNull()
  })
  it('weigert een einde vóór het begin', () => {
    expect(validateRange({ start: '2026-11-05', end: '2026-11-03' })).toBe('einde_voor_begin')
  })
  it('weigert onbestaande datums', () => {
    expect(validateRange({ start: '2026-02-30', end: '2026-03-01' })).toBe('ongeldige_datum')
  })
})

describe('rangeLength', () => {
  it('telt begin en einde mee', () => {
    expect(rangeLength({ start: '2026-11-03', end: '2026-11-05' })).toBe(3)
    expect(rangeLength({ start: '2026-11-03', end: '2026-11-03' })).toBe(1)
  })
})

describe('rangesOverlap', () => {
  const a = { start: '2026-11-03', end: '2026-11-05' }
  it('overlapt bij een gedeelde dag, ook alleen de randdag', () => {
    expect(rangesOverlap(a, { start: '2026-11-05', end: '2026-11-07' })).toBe(true)
    expect(rangesOverlap(a, { start: '2026-11-01', end: '2026-11-03' })).toBe(true)
  })
  it('overlapt als de ene binnen de andere valt', () => {
    expect(rangesOverlap(a, { start: '2026-11-04', end: '2026-11-04' })).toBe(true)
    expect(rangesOverlap({ start: '2026-11-04', end: '2026-11-04' }, a)).toBe(true)
  })
  it('overlapt niet als ze op elkaar aansluiten', () => {
    // Terugbrengen op de 5e en iemand anders vanaf de 6e: geen botsing.
    expect(rangesOverlap(a, { start: '2026-11-06', end: '2026-11-08' })).toBe(false)
    expect(rangesOverlap(a, { start: '2026-10-30', end: '2026-11-02' })).toBe(false)
  })
})

describe('intersectRanges', () => {
  it('geeft de gedeelde dagen', () => {
    expect(intersectRanges(
      { start: '2026-11-03', end: '2026-11-10' },
      { start: '2026-11-08', end: '2026-11-15' },
    )).toEqual({ start: '2026-11-08', end: '2026-11-10' })
  })
  it('geeft null zonder overlap', () => {
    expect(intersectRanges(
      { start: '2026-11-03', end: '2026-11-05' },
      { start: '2026-11-06', end: '2026-11-07' },
    )).toBeNull()
  })
})

describe('findConflicts', () => {
  const booked: BookedUnit[] = [
    { bookingId: 'b1', unitId: 'fx3a', range: { start: '2026-11-03', end: '2026-11-05' }, cancelled: false, holderLabel: 'Bram' },
    { bookingId: 'b2', unitId: 'fx3b', range: { start: '2026-11-04', end: '2026-11-04' }, cancelled: false, holderLabel: 'NoStrezz' },
    { bookingId: 'b3', unitId: 'fx3c', range: { start: '2026-11-01', end: '2026-11-30' }, cancelled: true,  holderLabel: 'Jelle' },
  ]

  it('vindt botsingen per unit met alleen de botsende dagen', () => {
    const c = findConflicts(['fx3a', 'fx3b'], { start: '2026-11-04', end: '2026-11-06' }, booked)
    expect(c).toEqual([
      { unitId: 'fx3a', bookingId: 'b1', holderLabel: 'Bram',     days: { start: '2026-11-04', end: '2026-11-05' } },
      { unitId: 'fx3b', bookingId: 'b2', holderLabel: 'NoStrezz', days: { start: '2026-11-04', end: '2026-11-04' } },
    ])
  })

  it('negeert geannuleerde boekingen', () => {
    expect(findConflicts(['fx3c'], { start: '2026-11-10', end: '2026-11-12' }, booked)).toEqual([])
  })

  it('negeert units die niet gevraagd zijn', () => {
    expect(findConflicts(['fs7'], { start: '2026-11-03', end: '2026-11-05' }, booked)).toEqual([])
  })

  it('botst niet met zichzelf bij wijzigen', () => {
    expect(findConflicts(['fx3a'], { start: '2026-11-03', end: '2026-11-07' }, booked, 'b1')).toEqual([])
  })

  it('geeft niets bij aansluitende periodes', () => {
    expect(findConflicts(['fx3a'], { start: '2026-11-06', end: '2026-11-08' }, booked)).toEqual([])
  })
})

describe('conflictDays', () => {
  it('somt elke botsende dag één keer op', () => {
    const days = conflictDays([
      { unitId: 'a', bookingId: 'b1', holderLabel: 'x', days: { start: '2026-11-04', end: '2026-11-05' } },
      { unitId: 'b', bookingId: 'b2', holderLabel: 'y', days: { start: '2026-11-05', end: '2026-11-06' } },
    ])
    expect([...days].sort()).toEqual(['2026-11-04', '2026-11-05', '2026-11-06'])
  })
})
