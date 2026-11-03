import { describe, it, expect } from 'vitest'
import { formatPlate, parseCarInput, parseKm } from '@/lib/poolwagens/car-input'

const NOW = new Date('2026-11-03T10:00:00Z')

describe('parseKm', () => {
  it('neemt gehele getallen vanaf 0, met punten of spaties als duizendtal', () => {
    expect(parseKm(0)).toBe(0)
    expect(parseKm('123456')).toBe(123456)
    expect(parseKm('123.456')).toBe(123456)
    expect(parseKm('123 456')).toBe(123456)
  })

  it('weigert negatief, kommagetallen en tekst', () => {
    expect(parseKm(-1)).toBeNull()
    expect(parseKm('12,5')).toBeNull()
    expect(parseKm(12.5)).toBeNull()
    expect(parseKm('abc')).toBeNull()
    expect(parseKm('')).toBeNull()
  })
})

describe('formatPlate', () => {
  it('hoofdletters, zonder overbodige spaties', () => {
    expect(formatPlate('  1-abc-234 ')).toBe('1-ABC-234')
    expect(formatPlate('1 abc   234')).toBe('1 ABC 234')
  })
})

describe('parseCarInput — nieuwe wagen', () => {
  it('naam en nummerplaat zijn verplicht', () => {
    expect(parseCarInput({ license_plate: '1-ABC-234' }, false)).toEqual({ error: 'Geef de wagen een naam.' })
    expect(parseCarInput({ name: 'Bus' }, false)).toEqual({ error: 'Vul de nummerplaat in.' })
  })

  it('zonder kilometerstand begint hij op 0', () => {
    expect(parseCarInput({ name: ' Bus ', license_plate: '1-abc-234', make_model: '' }, false)).toEqual({
      row: { name: 'Bus', license_plate: '1-ABC-234', make_model: null, current_km: 0 },
    })
  })

  it('weigert een ongeldige kilometerstand', () => {
    expect(parseCarInput({ name: 'Bus', license_plate: 'X', current_km: '-5' }, false))
      .toEqual({ error: 'De kilometerstand is een geheel getal vanaf 0.' })
  })
})

describe('parseCarInput — wijziging', () => {
  it('alleen wat meegestuurd is', () => {
    expect(parseCarInput({ current_km: '45.000' }, true)).toEqual({ row: { current_km: 45000 } })
  })

  it('een lege naam of nummerplaat mag niet', () => {
    expect(parseCarInput({ name: '  ' }, true)).toEqual({ error: 'Geef de wagen een naam.' })
    expect(parseCarInput({ license_plate: '' }, true)).toEqual({ error: 'Vul de nummerplaat in.' })
  })

  it('niet beschikbaar zetten met reden, weer beschikbaar wist de reden', () => {
    expect(parseCarInput({ manual_block: true, manual_block_note: ' onderhoud ' }, true))
      .toEqual({ row: { manual_block: true, manual_block_note: 'onderhoud' } })
    expect(parseCarInput({ manual_block: false, manual_block_note: 'blijft niet' }, true))
      .toEqual({ row: { manual_block: false, manual_block_note: null } })
  })

  it('archiveren en terugzetten', () => {
    expect(parseCarInput({ archived: true }, true, NOW)).toEqual({ row: { archived_at: '2026-11-03T10:00:00.000Z' } })
    expect(parseCarInput({ archived: false }, true, NOW)).toEqual({ row: { archived_at: null } })
  })

  it('weigert vreemde waarden en een lege wijziging', () => {
    expect(parseCarInput({ manual_block: 'ja' }, true)).toEqual({ error: 'Ongeldige beschikbaarheid.' })
    expect(parseCarInput({ archived: 1 }, true)).toEqual({ error: 'Ongeldige waarde voor archiveren.' })
    expect(parseCarInput({}, true)).toEqual({ error: 'Er is niets om te wijzigen.' })
    expect(parseCarInput(null, true)).toEqual({ error: 'Er is niets om te wijzigen.' })
  })
})
