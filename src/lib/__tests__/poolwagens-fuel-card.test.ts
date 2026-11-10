import { describe, it, expect } from 'vitest'
import { CARD_NUMBER_TEXT, PIN_TEXT, canSeePin, cardLast4, fuelCardChanged, nextFuelCard, parseFuelCardInput } from '@/lib/poolwagens/fuel-card'
import { CAR_COLUMNS, RESERVATION_COLUMNS } from '@/lib/poolwagens/types'

// De tankkaart en de pincode (0087): dezelfde regels als in de database, en
// de pincode zit nergens in wat de planning of de wagens ophalen.

describe('parseFuelCardInput', () => {
  it('neemt een geldig nummer en een geldige pincode over', () => {
    expect(parseFuelCardInput({ card_number: ' 7077 1234 5678 9012 ', pin: '1234' }))
      .toEqual({ input: { card_number: '7077 1234 5678 9012', pin: '1234', clear_pin: false } })
  })

  it('leeg nummer wist het nummer, lege pincode laat de bestaande staan', () => {
    expect(parseFuelCardInput({ card_number: '', pin: '' })).toEqual({ input: { card_number: null, pin: null, clear_pin: false } })
    expect(parseFuelCardInput({ card_number: '7077 1234', clear_pin: true })).toEqual({ input: { card_number: '7077 1234', pin: null, clear_pin: true } })
  })

  it('weigert een te kort of te lang nummer en een ongeldige pincode', () => {
    expect(parseFuelCardInput({ card_number: '1-2' })).toEqual({ error: CARD_NUMBER_TEXT })
    expect(parseFuelCardInput({ card_number: '1'.repeat(41) })).toEqual({ error: CARD_NUMBER_TEXT })
    for (const pin of ['123', '123456789', '12a4', '12 34']) expect(parseFuelCardInput({ card_number: '7077 1234', pin })).toEqual({ error: PIN_TEXT })
  })

  it('een nieuwe pincode en wissen tegelijk kan niet', () => {
    expect(parseFuelCardInput({ card_number: '7077 1234', pin: '1234', clear_pin: true })).toMatchObject({ error: expect.any(String) })
    expect(parseFuelCardInput({ clear_pin: 'ja' })).toEqual({ error: 'Ongeldig verzoek.' })
  })
})

describe('laatste vier tekens', () => {
  it('zoals de database: alleen cijfers en letters, in hoofdletters', () => {
    expect(cardLast4(' 7077 1234-5678 90ab ')).toBe('90AB')
    expect(cardLast4('7077')).toBe('7077')
    expect(cardLast4('')).toBeNull()
    expect(cardLast4(null)).toBeNull()
  })
})

describe('fuelCardChanged', () => {
  const saved = { card_number: '7077 1234' }
  it('alleen als er echt iets te bewaren is', () => {
    expect(fuelCardChanged(saved, { card_number: ' 7077 1234 ', pin: '', clear_pin: false })).toBe(false)
    expect(fuelCardChanged(saved, { card_number: '7077 9999', pin: '', clear_pin: false })).toBe(true)
    expect(fuelCardChanged(saved, { card_number: '7077 1234', pin: '4321', clear_pin: false })).toBe(true)
    expect(fuelCardChanged(saved, { card_number: '7077 1234', pin: '', clear_pin: true })).toBe(true)
    expect(fuelCardChanged({ card_number: null }, { card_number: '', pin: '', clear_pin: false })).toBe(false)
  })
})

describe('canSeePin (zoals pool_fuel_card_pin)', () => {
  const trip = { user_id: 'u1', departed_at: '2026-11-10T08:00:00Z', arrived_at: null }
  it('tijdens de eigen rit, of voor beheer', () => {
    expect(canSeePin(trip, 'u1', false)).toBe(true)
    expect(canSeePin(trip, 'u2', false)).toBe(false)
    expect(canSeePin(trip, 'u2', true)).toBe(true)
  })
  it('niet vóór het vertrek en niet na de aankomst', () => {
    expect(canSeePin({ ...trip, departed_at: null }, 'u1', false)).toBe(false)
    expect(canSeePin({ ...trip, arrived_at: '2026-11-10T10:00:00Z' }, 'u1', false)).toBe(false)
    expect(canSeePin({ ...trip, arrived_at: '2026-11-10T10:00:00Z' }, 'u1', true)).toBe(false)
  })
})

describe('de pincode zit nergens in de gewone gegevens', () => {
  it('wagens en reservaties halen alleen de laatste vier tekens op', () => {
    expect(CAR_COLUMNS).toContain('fuel_card_last4')
    expect(CAR_COLUMNS).not.toMatch(/pin|card_number/)
    expect(RESERVATION_COLUMNS).not.toMatch(/pin|card/)
  })
})

describe('nextFuelCard (zoals pool_set_fuel_card)', () => {
  const prev = { card_number: '7077 1234', has_pin: true }
  it('een lege pincode laat de bestaande staan; wissen wist ze', () => {
    expect(nextFuelCard('c', prev, { card_number: '7077 9999', pin: null, clear_pin: false })).toEqual({ car_id: 'c', card_number: '7077 9999', has_pin: true })
    expect(nextFuelCard('c', prev, { card_number: '7077 1234', pin: null, clear_pin: true })).toEqual({ car_id: 'c', card_number: '7077 1234', has_pin: false })
    expect(nextFuelCard('c', null, { card_number: null, pin: '1234', clear_pin: false })).toEqual({ car_id: 'c', card_number: null, has_pin: true })
  })
  it('geen nummer en geen pincode: weg', () => {
    expect(nextFuelCard('c', prev, { card_number: null, pin: null, clear_pin: true })).toBeNull()
    expect(nextFuelCard('c', null, { card_number: null, pin: null, clear_pin: false })).toBeNull()
  })
})
