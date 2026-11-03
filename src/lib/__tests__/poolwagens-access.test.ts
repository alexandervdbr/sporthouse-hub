import { describe, it, expect } from 'vitest'
import { poolwagenAccess } from '@/lib/poolwagens/access'
import { ALL_SECTION_KEYS, sectionsForLevels } from '@/lib/access-roles'

const withSections = (sections: string[]) => ({ app_metadata: { permissions: { sections } } })

describe('poolwagenAccess', () => {
  it('niet ingelogd mag niets', () => {
    expect(poolwagenAccess(null)).toEqual({ use: false, manage: false })
  })

  it('volgt de niveaus van de module Poolwagens', () => {
    expect(poolwagenAccess(withSections([]))).toEqual({ use: false, manage: false })
    expect(poolwagenAccess(withSections(['poolwagens']))).toEqual({ use: true, manage: false })
    expect(poolwagenAccess(withSections(['poolwagens', 'poolwagens_beheren']))).toEqual({ use: true, manage: true })
  })

  it('een account zonder ingestelde rechten mag niets (strikt, zoals de database)', () => {
    expect(poolwagenAccess({ app_metadata: {} })).toEqual({ use: false, manage: false })
  })

  it('beheer mag alles', () => {
    expect(poolwagenAccess(withSections(['beheer']))).toEqual({ use: true, manage: true })
  })

  it('een freelancer mag niets, ook niet met de sleutels', () => {
    expect(poolwagenAccess({ app_metadata: { freelancer: true, permissions: { sections: ['poolwagens', 'poolwagens_beheren'] } } }))
      .toEqual({ use: false, manage: false })
  })
})

describe('module Poolwagens in de rollen', () => {
  it('beide sleutels zijn te krijgen', () => {
    expect(ALL_SECTION_KEYS).toContain('poolwagens')
    expect(ALL_SECTION_KEYS).toContain('poolwagens_beheren')
  })

  it('staat standaard uit, Gebruiken geeft geen beheer, Beheren bevat Gebruiken', () => {
    expect(sectionsForLevels({})).not.toContain('poolwagens')
    const use = sectionsForLevels({ poolwagens: 'gebruiken' })
    expect(use).toContain('poolwagens')
    expect(use).not.toContain('poolwagens_beheren')
    const manage = sectionsForLevels({ poolwagens: 'beheren' })
    expect(manage).toEqual(expect.arrayContaining(['poolwagens', 'poolwagens_beheren']))
  })
})
