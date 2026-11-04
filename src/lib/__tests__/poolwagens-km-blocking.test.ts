import { describe, it, expect } from 'vitest'
import { arrivalKmError, drivenKm } from '@/lib/poolwagens/km'
import { carBlock, isBlockingDamage } from '@/lib/poolwagens/blocking'

describe('km-validatie', () => {
  it('aankomst minstens gelijk aan vertrek', () => {
    expect(arrivalKmError(1000, 1000)).toBeNull()
    expect(arrivalKmError(1000, 1150)).toBeNull()
    expect(arrivalKmError(1000, 999)).toBe('De kilometerstand bij aankomst (999) moet minstens die bij vertrek (1000) zijn.')
    expect(arrivalKmError(1000, null)).toBe('Vul de kilometerstand bij aankomst in.')
  })
  it('gereden km', () => {
    expect(drivenKm(1000, 1150)).toBe(150)
    expect(drivenKm(1000, null)).toBeNull()
  })
})

describe('blokkering', () => {
  const car = { name: 'Bus', manual_block: false, manual_block_note: null, archived_at: null }
  const damage = (severity: 'licht' | 'ernstig', status: 'gemeld' | 'in_behandeling' | 'hersteld', lifted: string | null = null) =>
    ({ severity, status, block_lifted_at: lifted })

  it('alleen ernstig, niet hersteld en niet opgeheven blokkeert', () => {
    expect(isBlockingDamage(damage('ernstig', 'gemeld'))).toBe(true)
    expect(isBlockingDamage(damage('ernstig', 'in_behandeling'))).toBe(true)
    expect(isBlockingDamage(damage('ernstig', 'hersteld'))).toBe(false)
    expect(isBlockingDamage(damage('ernstig', 'gemeld', '2026-11-04T10:00:00Z'))).toBe(false)
    expect(isBlockingDamage(damage('licht', 'gemeld'))).toBe(false)
  })

  it('een vrije wagen is niet geblokkeerd', () => {
    expect(carBlock(car, [damage('licht', 'gemeld')])).toBeNull()
  })

  it('handmatig, door schade, of gearchiveerd — met dezelfde tekst als de database', () => {
    expect(carBlock({ ...car, manual_block: true, manual_block_note: 'onderhoud' }, []))
      .toEqual({ kind: 'handmatig', reason: 'Bus is niet beschikbaar (onderhoud)' })
    expect(carBlock({ ...car, manual_block: true }, [])).toEqual({ kind: 'handmatig', reason: 'Bus is niet beschikbaar' })
    expect(carBlock(car, [damage('ernstig', 'gemeld')])).toEqual({ kind: 'schade', reason: 'Bus is geblokkeerd door ernstige schade' })
    expect(carBlock({ ...car, archived_at: '2026-01-01T00:00:00Z', manual_block: true }, []))
      .toEqual({ kind: 'gearchiveerd', reason: 'Bus is gearchiveerd' })
  })
})
