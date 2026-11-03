import { describe, it, expect } from 'vitest'
import { barLabel, homeNotice, personColor, shortNames } from '@/lib/gear/labels'
import { isBookable, isUnitStatus, STATUS_LABEL, UNIT_STATUSES } from '@/lib/gear/status'

describe('barLabel', () => {
  it('toont een persoon alleen in zijn eigen kleur', () => {
    expect(barLabel({ personName: 'Bram' })).toEqual({ text: 'Bram', color: personColor('Bram') })
  })

  it('toont een klant alleen in de kleur van de klant', () => {
    expect(barLabel({ clientName: 'NoStrezz', clientColor: '#ff0000' })).toEqual({ text: 'NoStrezz', color: '#ff0000' })
  })

  it('toont persoon en klant samen, in de kleur van de klant', () => {
    expect(barLabel({ personName: 'Bram', clientName: 'NoStrezz', clientColor: '#ff0000' }))
      .toEqual({ text: 'Bram · NoStrezz', color: '#ff0000' })
  })

  it('valt terug op een neutrale kleur als de klant er geen heeft', () => {
    expect(barLabel({ clientName: 'NoStrezz' }).color).toBe('#71717a')
  })

  it('negeert lege namen', () => {
    expect(barLabel({ personName: '  ', clientName: 'NoStrezz', clientColor: '#f00' }).text).toBe('NoStrezz')
    expect(barLabel({}).text).toBe('Onbekend')
  })
})

describe('personColor', () => {
  it('geeft dezelfde naam altijd dezelfde kleur', () => {
    expect(personColor('Torken')).toBe(personColor('Torken'))
    expect(personColor('Torken')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('shortNames', () => {
  it('gebruikt de voornaam', () => {
    const m = shortNames(['Bram Kreike', 'Rane Peeters'])
    expect(m.get('Bram Kreike')).toBe('Bram')
    expect(m.get('Rane Peeters')).toBe('Rane')
  })
  it('voegt een initiaal toe bij dezelfde voornaam', () => {
    const m = shortNames(['Jelle Aerts', 'Jelle Bosmans', 'Kenny Claes'])
    expect(m.get('Jelle Aerts')).toBe('Jelle A.')
    expect(m.get('Jelle Bosmans')).toBe('Jelle B.')
    expect(m.get('Kenny Claes')).toBe('Kenny')
  })
})

describe('homeNotice', () => {
  it('noemt de vaste houder bij naam', () => {
    expect(homeNotice('Sporting Hasselt')).toBe('Dit materiaal kan gehuurd worden in samenspraak met Sporting Hasselt.')
    expect(homeNotice(' Friends of Sports ')).toBe('Dit materiaal kan gehuurd worden in samenspraak met Friends of Sports.')
  })
})

describe('status', () => {
  it('laat ok en beperkt boeken, defect en uit dienst niet', () => {
    expect(isBookable('ok')).toBe(true)
    expect(isBookable('beperkt')).toBe(true)
    expect(isBookable('defect')).toBe(false)
    expect(isBookable('uit_dienst')).toBe(false)
  })
  it('herkent alleen bekende statussen', () => {
    expect(isUnitStatus('defect')).toBe(true)
    expect(isUnitStatus('KAPOT')).toBe(false)
  })
  it('heeft voor elke status een label', () => {
    for (const s of UNIT_STATUSES) expect(STATUS_LABEL[s]).toBeTruthy()
  })
})
