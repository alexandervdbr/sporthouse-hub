import { describe, it, expect } from 'vitest'
import { parseBookingInput } from '@/lib/gear/booking-input'

describe('parseBookingInput', () => {
  it('zet het formulier om naar de argumenten van de databasefunctie', () => {
    expect(parseBookingInput({
      start_date: '2026-11-13', end_date: '2026-11-15', unit_ids: ['a', 'b'],
      user_id: 'u1', client_id: ' c1 ', note: '  ', external_name: '',
    })).toEqual({ args: {
      p_start_date: '2026-11-13', p_end_date: '2026-11-15', p_unit_ids: ['a', 'b'],
      p_user_id: 'u1', p_freelancer_id: null, p_external_name: null,
      p_client_id: 'c1', p_project_id: null, p_note: null,
    } })
  })

  it('weigert ontbrekende of onbestaande datums', () => {
    expect(parseBookingInput({ end_date: '2026-11-15', unit_ids: ['a'] })).toHaveProperty('error')
    expect(parseBookingInput({ start_date: '2026-02-30', end_date: '2026-03-01', unit_ids: ['a'] })).toHaveProperty('error')
  })

  it('weigert een lijst units die geen lijst van id\'s is', () => {
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', unit_ids: 'a' })).toHaveProperty('error')
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', unit_ids: [1] })).toHaveProperty('error')
  })

  it('laat de regels over voor wie aan de database', () => {
    // Geen persoon en geen klant: de vorm klopt, gear_create_booking weigert.
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', unit_ids: ['a'] })).toHaveProperty('args')
  })
})
