import { describe, it, expect } from 'vitest'
import { parseBookingInput } from '@/lib/gear/booking-input'

describe('parseBookingInput', () => {
  it('zet het formulier om naar de argumenten van de databasefunctie', () => {
    expect(parseBookingInput({
      start_date: '2026-11-13', end_date: '2026-11-15', item_ids: ['a'], kit_ids: ['k'], excluded_item_ids: ['x'],
      user_id: 'u1', client_id: ' c1 ', note: '  ', external_name: '',
    })).toEqual({ args: {
      p_start_date: '2026-11-13', p_end_date: '2026-11-15', p_item_ids: ['a'], p_kit_ids: ['k'], p_excluded_item_ids: ['x'],
      p_user_id: 'u1', p_freelancer_id: null, p_external_name: null,
      p_client_id: 'c1', p_project_id: null, p_note: null,
    } })
  })

  it('weigert ontbrekende of onbestaande datums', () => {
    expect(parseBookingInput({ end_date: '2026-11-15', item_ids: ['a'] })).toHaveProperty('error')
    expect(parseBookingInput({ start_date: '2026-02-30', end_date: '2026-03-01', item_ids: ['a'] })).toHaveProperty('error')
  })

  it('weigert lijsten die geen lijst van id\'s zijn, en een lege keuze', () => {
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', item_ids: 'a' })).toHaveProperty('error')
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', kit_ids: [1] })).toHaveProperty('error')
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13' })).toHaveProperty('error')
  })

  it('een kit alleen is genoeg; ontbrekende lijsten worden leeg', () => {
    const r = parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', kit_ids: ['k'], client_id: 'c' })
    expect(r).toMatchObject({ args: { p_item_ids: [], p_kit_ids: ['k'], p_excluded_item_ids: [] } })
  })

  it('laat de regels over voor wie aan de database', () => {
    // Geen persoon en geen klant: de vorm klopt, gear_create_booking weigert.
    expect(parseBookingInput({ start_date: '2026-11-13', end_date: '2026-11-13', item_ids: ['a'] })).toHaveProperty('args')
  })
})
