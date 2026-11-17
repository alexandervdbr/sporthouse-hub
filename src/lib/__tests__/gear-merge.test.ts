import { describe, expect, it } from 'vitest'
import { combinedNote, holderOf, keepOptions, mergeCheck, samePeriodMatches, saveRequest, type MergeBooking, type NewBookingProbe } from '@/lib/gear/merge'
import { groupMyBookings, isMine } from '@/lib/gear/my-bookings'
import type { GearBooking } from '@/lib/gear/types'

const base: MergeBooking = {
  id: 'b1', start_date: '2026-11-20', end_date: '2026-11-21', start_time: '10:00', end_time: '18:00',
  booked_for_user_id: 'bram', freelancer_id: null, external_name: null, person_name: 'Bram',
  client: { id: 'c1', name: 'NoStrezz', color: '#f00' }, project: null, note: 'shoot',
}
const mk = (over: Partial<MergeBooking>): MergeBooking => ({ ...base, ...over })

describe('mergeCheck (Samenvoegen)', () => {
  it('twee boekingen van dezelfde persoon met exact dezelfde periode: mag', () => {
    expect(mergeCheck([base, mk({ id: 'b2' })])).toEqual({ ok: true })
  })
  it('minder dan twee: niet', () => {
    expect(mergeCheck([base]).ok).toBe(false)
  })
  it('andere periode: één regel uitleg, ook bij één kwartier verschil', () => {
    const r = mergeCheck([base, mk({ id: 'b2', end_time: '18:15' })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason.startsWith('Andere periode:')).toBe(true)
  })
  it('andere persoon: niet', () => {
    const r = mergeCheck([base, mk({ id: 'b2', booked_for_user_id: 'jan', person_name: 'Jan' })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Andere persoon')
  })
  it('zonder persoon telt de klant; een externe naam zonder hoofdletters', () => {
    expect(holderOf(mk({ booked_for_user_id: null, person_name: null })).key).toBe('c:c1')
    expect(holderOf(mk({ booked_for_user_id: null, external_name: ' Arne ' })).key)
      .toBe(holderOf(mk({ booked_for_user_id: null, external_name: 'arne' })).key)
  })
})

describe('klant/project en notities', () => {
  it('gelijke klant en project: niets te kiezen', () => {
    expect(keepOptions([base, mk({ id: 'b2' })])).toHaveLength(1)
  })
  it('verschillend: een keuze per combinatie', () => {
    const o = keepOptions([base, mk({ id: 'b2', client: null }), mk({ id: 'b3', project: { id: 'p', name: 'Teaser' } })])
    expect(o.map(x => x.label)).toEqual(['NoStrezz', 'Geen klant', 'NoStrezz · Teaser'])
  })
  it('notities samen, elke tekst één keer', () => {
    expect(combinedNote([{ note: 'shoot' }, { note: 'Shoot ' }, { note: null }, { note: 'extra' }])).toBe('shoot · extra')
    expect(combinedNote([{ note: null }, { note: ' ' }])).toBeNull()
  })
})

describe('voorstel bij een nieuwe boeking', () => {
  const probe: NewBookingProbe = {
    start_date: '2026-11-20', end_date: '2026-11-21', start_time: '10:00', end_time: '18:00',
    user_id: 'bram', freelancer_id: null, external_name: null, client_id: null,
  }
  const yes = () => true
  it('exact dezelfde periode en persoon: voorstel', () => {
    expect(samePeriodMatches(probe, [base], yes).map(b => b.id)).toEqual(['b1'])
  })
  it('één minuut verschil: geen voorstel', () => {
    expect(samePeriodMatches({ ...probe, end_time: '18:01' }, [base], yes)).toEqual([])
    expect(samePeriodMatches({ ...probe, start_time: '09:59' }, [base], yes)).toEqual([])
  })
  it('hele dag tegenover een uur: geen voorstel', () => {
    expect(samePeriodMatches({ ...probe, start_time: null }, [base], yes)).toEqual([])
  })
  it('een andere persoon, of een boeking die je niet mag wijzigen: geen voorstel', () => {
    expect(samePeriodMatches({ ...probe, user_id: 'jan' }, [base], yes)).toEqual([])
    expect(samePeriodMatches(probe, [base], () => false)).toEqual([])
  })
  it('meerdere overeenkomsten: allemaal, om uit te kiezen', () => {
    expect(samePeriodMatches(probe, [base, mk({ id: 'b2' })], yes)).toHaveLength(2)
  })
  it('weigeren ("Nee, aparte boeking"): een gewone aparte boeking, zoals altijd', () => {
    const body = { start_date: '2026-11-20', item_ids: ['i1'] }
    expect(saveRequest(body, { kind: 'separate' })).toEqual(body)
    expect(saveRequest(body, { kind: 'separate' })).not.toHaveProperty('merge_into')
  })
  it('"Ja, toevoegen": dezelfde aanvraag, met de boeking en wat blijft', () => {
    expect(saveRequest({ a: 1 }, { kind: 'into', bookingId: 'b1', keep: 'new' })).toEqual({ a: 1, merge_into: 'b1', keep: 'new' })
  })
})

describe('Mijn boekingen: groepen', () => {
  const b = (id: string, start: string, st: string | null, end: string, et: string | null) =>
    ({ id, start_date: start, start_time: st, end_date: end, end_time: et, lines: [], created_by: 'x', booked_for_user_id: 'bram' }) as unknown as GearBooking
  it('nu bij mij, binnenkort, voorbij — met de uren', () => {
    const now = '2026-11-17T12:00'
    const g = groupMyBookings([
      b('weg', '2026-11-17', '08:00', '2026-11-17', '11:00'),
      b('nu', '2026-11-16', null, '2026-11-17', null),
      b('straks', '2026-11-17', '14:00', '2026-11-17', '16:00'),
    ], now)
    expect(g.nu.map(x => x.id)).toEqual(['nu'])
    expect(g.binnenkort.map(x => x.id)).toEqual(['straks'])
    expect(g.voorbij.map(x => x.id)).toEqual(['weg'])
  })
  it('van mij: voor mij geboekt of door mij gemaakt', () => {
    expect(isMine({ created_by: 'bram', booked_for_user_id: 'jan' }, 'bram')).toBe(true)
    expect(isMine({ created_by: 'jan', booked_for_user_id: 'bram' }, 'bram')).toBe(true)
    expect(isMine({ created_by: 'jan', booked_for_user_id: null }, 'bram')).toBe(false)
  })
})
