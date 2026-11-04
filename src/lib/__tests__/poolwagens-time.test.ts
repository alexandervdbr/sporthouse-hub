import { describe, it, expect } from 'vitest'
import { brusselsDay, brusselsDayStartISO, brusselsLocalToISO, formatPeriod, isoToBrusselsLocal, periodsOverlap } from '@/lib/poolwagens/time'

describe('brusselsLocalToISO', () => {
  it('wintertijd is UTC+1, zomertijd UTC+2', () => {
    expect(brusselsLocalToISO('2026-01-15T09:00')).toBe('2026-01-15T08:00:00.000Z')
    expect(brusselsLocalToISO('2026-07-15T09:00')).toBe('2026-07-15T07:00:00.000Z')
  })

  it('rond de omschakeling klopt het ook', () => {
    // Zomertijd begint zondag 29 maart 2026 om 02:00 → 03:00.
    expect(brusselsLocalToISO('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z')
    expect(brusselsLocalToISO('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z')
    // Wintertijd begint zondag 25 oktober 2026 om 03:00 → 02:00.
    expect(brusselsLocalToISO('2026-10-25T12:00')).toBe('2026-10-25T11:00:00.000Z')
    expect(brusselsLocalToISO('2026-10-24T12:00')).toBe('2026-10-24T10:00:00.000Z')
  })

  it('weigert wat geen kloktijd is', () => {
    expect(brusselsLocalToISO('2026-02-30T10:00')).toBeNull()
    expect(brusselsLocalToISO('2026-01-15T24:00')).toBeNull()
    expect(brusselsLocalToISO('2026-01-15 09:00')).toBeNull()
    expect(brusselsLocalToISO('morgen')).toBeNull()
  })

  it('heen en terug geeft dezelfde kloktijd', () => {
    for (const local of ['2026-01-01T00:00', '2026-06-30T23:59', '2026-10-25T04:15', '2026-11-04T14:30']) {
      expect(isoToBrusselsLocal(brusselsLocalToISO(local)!)).toBe(local)
    }
  })
})

describe('dagen en weergave', () => {
  it('middernacht in Brussel en de Brusselse dag van een tijdstip', () => {
    expect(brusselsDayStartISO('2026-11-04')).toBe('2026-11-03T23:00:00.000Z')
    expect(brusselsDay('2026-11-03T23:30:00Z')).toBe('2026-11-04')
  })

  it('een periode op één dag toont de dag één keer', () => {
    const p = formatPeriod(brusselsLocalToISO('2026-11-04T08:00')!, brusselsLocalToISO('2026-11-04T17:00')!)
    expect(p).toMatch(/4\/11/)
    expect(p).toMatch(/08:00.*17:00/)
    expect(p.match(/4\/11/g)).toHaveLength(1)
  })
})

describe('periodsOverlap (overlapcontrole, halfopen zoals de database)', () => {
  const p = (s: string, e: string) => ({ start: `2026-11-04T${s}:00Z`, end: `2026-11-04T${e}:00Z` })
  it('overlap', () => {
    expect(periodsOverlap(p('08:00', '12:00'), p('11:00', '13:00'))).toBe(true)
    expect(periodsOverlap(p('08:00', '18:00'), p('10:00', '11:00'))).toBe(true)
  })
  it('aansluitend is geen overlap', () => {
    expect(periodsOverlap(p('08:00', '12:00'), p('12:00', '14:00'))).toBe(false)
    expect(periodsOverlap(p('12:00', '14:00'), p('08:00', '12:00'))).toBe(false)
  })
  it('los van elkaar', () => {
    expect(periodsOverlap(p('08:00', '09:00'), p('10:00', '11:00'))).toBe(false)
  })
})
