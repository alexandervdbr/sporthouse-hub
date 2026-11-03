import { describe, it, expect } from 'vitest'
import { validateHolder, normalizeHolder, HOLDER_ERROR_TEXT } from '@/lib/gear/holder'

// Dezelfde regel als de twee checks op gear_bookings: minstens een persoon of
// een klant, en hooguit één soort persoon.

describe('validateHolder', () => {
  it('aanvaardt een collega, een freelancer of een externe naam alleen', () => {
    expect(validateHolder({ userId: 'u1' })).toBeNull()
    expect(validateHolder({ freelancerId: 'f1' })).toBeNull()
    expect(validateHolder({ externalName: 'Arne - EXTERN' })).toBeNull()
  })

  it('aanvaardt een klant alleen (zoals NoStrezz in de spreadsheet)', () => {
    expect(validateHolder({ clientId: 'nostrezz' })).toBeNull()
  })

  it('aanvaardt een persoon met een klant erbij', () => {
    expect(validateHolder({ userId: 'u1', clientId: 'nostrezz' })).toBeNull()
    expect(validateHolder({ externalName: 'Arne', clientId: 'nostrezz' })).toBeNull()
  })

  it('weigert een boeking zonder persoon en zonder klant', () => {
    expect(validateHolder({})).toBe('geen_persoon_of_klant')
    expect(validateHolder({ userId: null, clientId: null })).toBe('geen_persoon_of_klant')
  })

  it('telt lege tekst of spaties niet als ingevuld', () => {
    expect(validateHolder({ externalName: '   ' })).toBe('geen_persoon_of_klant')
    expect(validateHolder({ externalName: '', clientId: '' })).toBe('geen_persoon_of_klant')
  })

  it('weigert twee soorten persoon tegelijk', () => {
    expect(validateHolder({ userId: 'u1', freelancerId: 'f1' })).toBe('meerdere_personen')
    expect(validateHolder({ userId: 'u1', externalName: 'Arne' })).toBe('meerdere_personen')
    expect(validateHolder({ freelancerId: 'f1', externalName: 'Arne', clientId: 'c' })).toBe('meerdere_personen')
  })

  it('heeft voor elke fout een leesbare melding', () => {
    expect(HOLDER_ERROR_TEXT.geen_persoon_of_klant).toMatch(/persoon/)
    expect(HOLDER_ERROR_TEXT.meerdere_personen).toMatch(/één persoon/)
  })
})

describe('normalizeHolder', () => {
  it('trimt en zet lege waarden op null', () => {
    expect(normalizeHolder({ externalName: '  Arne - EXTERN ', userId: '' })).toEqual({
      userId: null, freelancerId: null, externalName: 'Arne - EXTERN', clientId: null,
    })
  })
})
