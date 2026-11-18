import { describe, it, expect } from 'vitest'
import { isActiveContact, EMPLOYMENT_TYPES, EMPLOYMENT_LABELS } from '@/lib/employment'

// Deze ene functie bepaalt wie er in het planningsrooster staat, wie op de
// Team-pagina onder welk tabblad valt, en wie je nog aan een project kan
// hangen. Als "actief" op die drie plekken iets anders zou betekenen, krijg je
// precies het soort verschil dat niemand opmerkt tot er iemand ontbreekt.

const OCT_8 = new Date(2026, 9, 8)

describe('isActiveContact', () => {
  it('zonder einddatum draait iemand gewoon mee', () => {
    expect(isActiveContact({}, OCT_8)).toBe(true)
    expect(isActiveContact({ active_until: null }, OCT_8)).toBe(true)
  })

  it('op de einddatum zelf werkt iemand nog', () => {
    // Dit is het verschil tussen "tot" en "tot en met", en het scheelt een
    // laatste werkdag die onzichtbaar wordt.
    expect(isActiveContact({ active_until: '2026-10-08' }, OCT_8)).toBe(true)
  })

  it('de dag erna niet meer', () => {
    expect(isActiveContact({ active_until: '2026-10-07' }, OCT_8)).toBe(false)
  })

  it('een einddatum in de toekomst verandert nu nog niets', () => {
    expect(isActiveContact({ active_until: '2026-12-31' }, OCT_8)).toBe(true)
  })

  it('rekent op kalenderdagen, niet op tijdstippen', () => {
    // Laat op de avond van de laatste werkdag moet nog steeds "actief" geven.
    const laat = new Date(2026, 9, 8, 23, 59)
    expect(isActiveContact({ active_until: '2026-10-08' }, laat)).toBe(true)
  })

  it('struikelt niet over een eencijferige maand of dag', () => {
    const jan5 = new Date(2027, 0, 5)
    expect(isActiveContact({ active_until: '2027-01-05' }, jan5)).toBe(true)
    expect(isActiveContact({ active_until: '2027-01-04' }, jan5)).toBe(false)
  })
})

describe('contractvormen', () => {
  it('heeft voor elke vorm een label', () => {
    for (const t of EMPLOYMENT_TYPES) {
      expect(EMPLOYMENT_LABELS[t]).toBeTruthy()
    }
  })

  it('komt overeen met wat de database toelaat', () => {
    // Spiegelt de check-constraint uit migratie 0051. Loopt dit uit elkaar,
    // dan weigert de database een waarde die het scherm wel aanbiedt.
    expect([...EMPLOYMENT_TYPES]).toEqual(['vast', 'stagiair', 'student'])
  })
})

import { employmentPatchForAccount } from '@/lib/employment'

// Een stagiair die via "Toegang verlenen" binnenkwam, stond in Team onder
// "Vast team": het contact kreeg de default 'vast' en geen einddatum.
describe('employmentPatchForAccount', () => {
  const stagiair = { requiresEndDate: true, expiresAt: '2027-06-04' }

  it('een nieuw contact wordt stagiair met de vervaldatum als einddatum', () => {
    expect(employmentPatchForAccount(null, stagiair)).toEqual({ employment_type: 'stagiair', active_until: '2027-06-04' })
  })

  it('een bestaand contact op vast zonder einddatum wordt aangevuld', () => {
    expect(employmentPatchForAccount({ employment_type: 'vast', active_until: null }, stagiair))
      .toEqual({ employment_type: 'stagiair', active_until: '2027-06-04' })
  })

  it('een student blijft student', () => {
    expect(employmentPatchForAccount({ employment_type: 'student', active_until: '2027-06-04' }, stagiair)).toEqual({})
  })

  it('een vervaldatum als tijdstip wordt een datum', () => {
    expect(employmentPatchForAccount(null, { requiresEndDate: true, expiresAt: '2027-06-04T00:00:00.000Z' }).active_until)
      .toBe('2027-06-04')
  })

  it('een einddatum die gelijk liep met het account schuift mee bij verlengen', () => {
    expect(employmentPatchForAccount(
      { employment_type: 'stagiair', active_until: '2027-06-04' },
      { requiresEndDate: true, expiresAt: '2027-07-01', previousExpiresAt: '2027-06-04' },
    )).toEqual({ active_until: '2027-07-01' })
  })

  it('een einddatum die in Team bewust anders staat, blijft staan', () => {
    expect(employmentPatchForAccount(
      { employment_type: 'stagiair', active_until: '2027-05-15' },
      { requiresEndDate: true, expiresAt: '2027-07-01', previousExpiresAt: '2027-06-04' },
    )).toEqual({})
  })

  it('een rol zonder einddatum raakt niets aan', () => {
    expect(employmentPatchForAccount(null, { requiresEndDate: false, expiresAt: '2027-06-04' })).toEqual({})
    expect(employmentPatchForAccount(null, { requiresEndDate: true, expiresAt: null })).toEqual({})
  })
})
