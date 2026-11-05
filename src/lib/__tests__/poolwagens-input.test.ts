import { describe, it, expect } from 'vitest'
import { parseArrivalInput, parseDepartNowInput, parseDepartureInput, parseReservationInput } from '@/lib/poolwagens/reservation-input'
import { parseDamageInput, parseRecipients } from '@/lib/poolwagens/damage-input'
import { clientSearch, parseHistoryFilters } from '@/lib/poolwagens/history'

const CAR = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'

describe('parseReservationInput', () => {
  const base = { car_id: CAR, start: '2026-11-05T08:00', end: '2026-11-05T17:30' }
  const times = { p_car_id: CAR, p_start_at: '2026-11-05T07:00:00.000Z', p_end_at: '2026-11-05T16:30:00.000Z' }

  it('zet Brusselse kloktijden om naar tijdstippen; klant en notitie mogen leeg', () => {
    expect(parseReservationInput(base)).toEqual({ args: { ...times, p_client_id: null, p_client_name: null, p_note: null, p_user_id: null } })
    expect(parseReservationInput({ ...base, note: ' x ' })).toMatchObject({ args: { p_note: 'x' } })
  })
  it('een bestaande klant: het id telt, een getypte naam ernaast niet', () => {
    expect(parseReservationInput({ ...base, client_id: CLIENT, client_name: 'iets anders' }))
      .toMatchObject({ args: { p_client_id: CLIENT, p_client_name: null } })
  })
  it('een getypte klant', () => {
    expect(parseReservationInput({ ...base, client_name: '  Club Zonder Account ' }))
      .toMatchObject({ args: { p_client_id: null, p_client_name: 'Club Zonder Account' } })
    expect(parseReservationInput({ ...base, client_id: '', client_name: '' }))
      .toMatchObject({ args: { p_client_id: null, p_client_name: null } })
  })
  it('weigert ontbrekende of verkeerde invoer', () => {
    expect(parseReservationInput({ start: '2026-11-05T08:00', end: '2026-11-05T09:00' })).toEqual({ error: 'Kies een wagen.' })
    expect(parseReservationInput({ car_id: CAR, start: '2026-11-05T08:00' })).toEqual({ error: 'Kies een vertrek en een verwachte terugkomst.' })
    expect(parseReservationInput({ car_id: CAR, start: '2026-11-05T08:00', end: '2026-11-05T08:00' })).toEqual({ error: 'De terugkomst ligt na het vertrek.' })
    expect(parseReservationInput({ car_id: 'drop table', start: '2026-11-05T08:00', end: '2026-11-05T09:00' })).toEqual({ error: 'Kies een wagen.' })
    expect(parseReservationInput({ ...base, client_id: 'geen-uuid' })).toEqual({ error: 'Ongeldige klant.' })
    expect(parseReservationInput({ ...base, client_name: 'x'.repeat(201) })).toEqual({ error: 'De klantnaam is hoogstens 200 tekens.' })
  })
  it('kent geen project meer', () => {
    const r = parseReservationInput({ ...base, project_id: CLIENT })
    expect(r).not.toHaveProperty('error')
    expect(JSON.stringify(r)).not.toContain('project')
  })
})

describe('parseDepartNowInput', () => {
  const now = new Date('2026-11-05T07:00:00Z')
  it('terugkomst in de toekomst, km optioneel', () => {
    expect(parseDepartNowInput({ car_id: CAR, end: '2026-11-05T12:00', km: '' }, now))
      .toEqual({ args: { p_car_id: CAR, p_end_at: '2026-11-05T11:00:00.000Z', p_client_id: null, p_client_name: null, p_note: null, p_km: null, p_user_id: null } })
    expect(parseDepartNowInput({ car_id: CAR, end: '2026-11-05T12:00', client_name: 'Croky', km: '45.120' }, now))
      .toMatchObject({ args: { p_client_name: 'Croky', p_km: 45120 } })
  })
  it('weigert een terugkomst in het verleden of een foute km', () => {
    expect(parseDepartNowInput({ car_id: CAR, end: '2026-11-05T07:30' }, now)).toEqual({ error: 'De verwachte terugkomst ligt in de toekomst.' })
    expect(parseDepartNowInput({ car_id: CAR, end: '2026-11-05T12:00', km: '-3' }, now)).toEqual({ error: 'De kilometerstand is een geheel getal vanaf 0.' })
  })
})

describe('vertrek en aankomst', () => {
  it('vertrek: alles mag ontbreken', () => {
    expect(parseDepartureInput({})).toEqual({ args: { p_departed_at: null, p_km: null } })
    expect(parseDepartureInput({ at: '2026-11-05T08:15', km: '1000' })).toEqual({ args: { p_departed_at: '2026-11-05T07:15:00.000Z', p_km: 1000 } })
    expect(parseDepartureInput({ at: 'gisteren' })).toEqual({ error: 'Ongeldig tijdstip van vertrek.' })
  })
  it('aankomst: km verplicht', () => {
    expect(parseArrivalInput({ at: '' })).toEqual({ error: 'Vul de kilometerstand bij aankomst in.' })
    expect(parseArrivalInput({ km: 'veel' })).toEqual({ error: 'De kilometerstand is een geheel getal vanaf 0.' })
    expect(parseArrivalInput({ km: 1150 })).toEqual({ args: { p_arrived_at: null, p_km: 1150 } })
  })
})

describe('parseDamageInput', () => {
  it('omschrijving en ernst verplicht, rit optioneel', () => {
    expect(parseDamageInput({ car_id: CAR, description: ' deuk ', severity: 'licht' }))
      .toEqual({ args: { p_car_id: CAR, p_reservation_id: null, p_description: 'deuk', p_severity: 'licht' } })
    expect(parseDamageInput({ car_id: CAR, description: '', severity: 'licht' })).toEqual({ error: 'Beschrijf de schade.' })
    expect(parseDamageInput({ car_id: CAR, description: 'x', severity: 'middel' })).toEqual({ error: 'Kies de ernst: licht of ernstig.' })
    expect(parseDamageInput({ car_id: CAR, description: 'x', severity: 'ernstig', reservation_id: 'abc' })).toEqual({ error: 'Ongeldige rit.' })
  })
})

describe('parseRecipients', () => {
  it('normaliseert en ontdubbelt', () => {
    expect(parseRecipients(' Vloot@Example.com, beheer@example.be\nvloot@example.com ;'))
      .toEqual({ list: ['beheer@example.be', 'vloot@example.com'] })
    expect(parseRecipients('')).toEqual({ list: [] })
  })
  it('noemt het ongeldige adres', () => {
    expect(parseRecipients('goed@example.com geen-adres')).toEqual({ error: 'Geen geldig e-mailadres: geen-adres' })
    expect(parseRecipients(42)).toEqual({ error: 'Ongeldige lijst ontvangers.' })
  })
})

describe('parseHistoryFilters', () => {
  it('filters uit de querystring, periode in Brusselse dagen', () => {
    const f = parseHistoryFilters(new URLSearchParams({ car: CAR, klant: ' Croky ', from: '2026-11-01', to: '2026-11-30', open: '1', page: '2' }))
    expect(f).toEqual({
      car: CAR, user: null, client: 'Croky',
      fromISO: '2026-10-31T23:00:00.000Z', untilISO: '2026-11-30T23:00:00.000Z', open: true, page: 2,
    })
  })
  it('ongeldige waarden vallen weg', () => {
    expect(parseHistoryFilters(new URLSearchParams({ car: 'x', from: '2026-13-01', page: '-1' })))
      .toEqual({ car: null, user: null, client: null, fromISO: null, untilISO: null, open: false, page: 0 })
  })

  it('een klantzoekterm kan geen ander filter worden', () => {
    expect(clientSearch('Croky),client_id.eq.(x')).toBe('Croky client_id.eq. x')
    expect(clientSearch('%*,')).toBeNull()
    expect(clientSearch('F.C. Brugge')).toBe('F.C. Brugge')
    expect(clientSearch('x'.repeat(150))).toHaveLength(100)
  })
})
