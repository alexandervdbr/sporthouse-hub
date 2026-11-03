import { describe, it, expect } from 'vitest'
import { gearAccess } from '@/lib/gear/access'
import { dbErrorStatus, dbErrorText } from '@/lib/gear/db-errors'

const withSections = (sections: string[]) => ({ app_metadata: { permissions: { sections } } })

describe('gearAccess', () => {
  it('niet ingelogd mag niets', () => {
    expect(gearAccess(null)).toEqual({ view: false, book: false, manageBookings: false, manageCatalog: false })
  })

  it('volgt de niveaus van de module Materiaal', () => {
    expect(gearAccess(withSections(['materiaal']))).toEqual(
      { view: true, book: false, manageBookings: false, manageCatalog: false })
    expect(gearAccess(withSections(['materiaal', 'materiaal_reserveren']))).toEqual(
      { view: true, book: true, manageBookings: false, manageCatalog: false })
    expect(gearAccess(withSections(['materiaal', 'materiaal_reserveren', 'reservering_verwijderen', 'materiaal_toevoegen']))).toEqual(
      { view: true, book: true, manageBookings: true, manageCatalog: true })
  })

  it('een account zonder ingestelde rechten mag alles, zoals pré-assist', () => {
    expect(gearAccess({ app_metadata: {} }).manageCatalog).toBe(true)
  })

  it('beheer mag alles', () => {
    expect(gearAccess(withSections(['beheer'])).manageBookings).toBe(true)
  })

  it('een freelancer-account mag niets, ook zonder rechten-object', () => {
    expect(gearAccess({ app_metadata: { freelancer: true } })).toEqual(
      { view: false, book: false, manageBookings: false, manageCatalog: false })
  })
})

describe('dbErrorStatus / dbErrorText', () => {
  it('geeft de meldingen van onze eigen functies ongewijzigd door', () => {
    const err = { code: '23P01', message: 'Al geboekt: FX3 A (13/11–15/11, Bram)' }
    expect(dbErrorStatus(err)).toBe(409)
    expect(dbErrorText(err)).toBe('Al geboekt: FX3 A (13/11–15/11, Bram)')
  })

  it('vertaalt Engelse Postgres-meldingen', () => {
    const dup = { code: '23505', message: 'duplicate key value violates unique constraint "gear_units_name_key"' }
    expect(dbErrorStatus(dup)).toBe(409)
    expect(dbErrorText(dup)).toBe('Dit bestaat al. Kies een andere naam.')
    expect(dbErrorText({ code: '42501', message: 'new row violates row-level security policy' }))
      .toBe('Je hebt hier geen rechten voor.')
  })

  it('valt terug op 500 en een algemene melding', () => {
    expect(dbErrorStatus({ code: 'XX000', message: '' })).toBe(500)
    expect(dbErrorText({})).toBe('Er ging iets mis bij het opslaan.')
  })

  it('zet niet-gevonden en ongeldige invoer op de juiste status', () => {
    expect(dbErrorStatus({ code: 'P0002' })).toBe(404)
    expect(dbErrorStatus({ code: '22023' })).toBe(400)
    expect(dbErrorStatus({ code: '23514' })).toBe(400)
  })

  it('maakt van "geen rij" bij .single() een nette 404', () => {
    const err = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
    expect(dbErrorStatus(err)).toBe(404)
    expect(dbErrorText(err)).toBe('Niet gevonden.')
  })
})
