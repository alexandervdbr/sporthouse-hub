import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  ACCESS_MODULES, sectionsForLevels, levelsFromSections, buildAppMetadata, type AccessRole,
} from '@/lib/access-roles'
import { hasSection, withImpliedSections, getSections } from '@/lib/auth-permissions'
import { freelancerLevel, canViewFreelancers, canManageFreelancers } from '@/features/freelancers/lib/access'

// Freelancers kreeg een niveau "bekijken" onder het bestaande "beheren".
// De eis: niemand verliest na de deploy een recht, ook niet wie een
// sleutellijst heeft die sinds deze wijziging nooit opnieuw berekend is.
// Daarom bleef de sleutel van "beheren" 'freelancers', en kwam "bekijken"
// erbij als 'freelancers_bekijken'.

const user = (sections: string[] | null) =>
  ({ email: 'x@example.com', app_metadata: sections ? { permissions: { sections } } : {} })

const ROOT = path.resolve(__dirname, '../../..')
const MODULE = ACCESS_MODULES.find(m => m.key === 'freelancers')!

describe('freelancers — niveaus', () => {
  it('heeft geen, bekijken en beheren, met beheren nog altijd op de oude sleutel', () => {
    expect(MODULE.levels.map(l => l.key)).toEqual(['geen', 'bekijken', 'beheren'])
    expect(sectionsForLevels({ freelancers: 'bekijken' })).toEqual(['freelancers_bekijken'])
    expect(sectionsForLevels({ freelancers: 'beheren' })).toEqual(['freelancers_bekijken', 'freelancers'])
    expect(sectionsForLevels({ freelancers: 'geen' })).toEqual([])
  })

  it('kent het juiste niveau toe', () => {
    expect(freelancerLevel(user(['freelancers']))).toBe('beheren')
    expect(freelancerLevel(user(['freelancers_bekijken', 'freelancers']))).toBe('beheren')
    expect(freelancerLevel(user(['freelancers_bekijken']))).toBe('bekijken')
    expect(freelancerLevel(user(['beheer']))).toBe('beheren')
    expect(freelancerLevel(user([]))).toBe('geen')
    expect(freelancerLevel(user(['team', 'planning']))).toBe('geen')
  })

  it('geeft niets aan een account zonder permissions-object (geen open toegang meer)', () => {
    expect(freelancerLevel(user(null))).toBe('geen')
    expect(canViewFreelancers(user(null))).toBe(false)
    expect(freelancerLevel(null)).toBe('geen')
  })

  it('bekijken mag niet beheren', () => {
    expect(canViewFreelancers(user(['freelancers_bekijken']))).toBe(true)
    expect(canManageFreelancers(user(['freelancers_bekijken']))).toBe(false)
  })
})

describe('freelancers — niemand verliest rechten', () => {
  // Zo staat het vandaag in app_metadata bij iedereen met het recht: alleen
  // de oude sleutel, want "bekijken" bestond nog niet.
  const STALE = ['dashboard', 'team', 'freelancers', 'planning']

  it('een oude sleutellijst met alleen "freelancers" blijft beheren, en mag dus ook bekijken', () => {
    const u = user(STALE)
    expect(canManageFreelancers(u)).toBe(true)
    expect(canViewFreelancers(u)).toBe(true)
    expect(hasSection(u, 'freelancers')).toBe(true)
    expect(hasSection(u, 'freelancers_bekijken')).toBe(true)
  })

  it('de zijbalk-sleutel volgt uit de oude sleutel', () => {
    expect(withImpliedSections(STALE)).toContain('freelancers_bekijken')
    const sidebar = fs.readFileSync(path.join(ROOT, 'src/components/layout/Sidebar.tsx'), 'utf8')
    expect(sidebar).toMatch(/href: '\/freelancers'[^\n]*section: 'freelancers_bekijken'/)
    expect(sidebar).toContain('withImpliedSections(permissions.sections).includes(key)')
  })

  it('het beheerscherm leest een oude sleutellijst als Beheren (opslaan kost dus niets)', () => {
    expect(levelsFromSections(STALE).freelancers).toBe('beheren')
    // Opnieuw omrekenen behoudt elke sleutel die er was.
    const again = sectionsForLevels(levelsFromSections(STALE))
    expect(again).toContain('freelancers')
  })

  it('withImpliedSections voegt alleen toe en haalt nooit iets weg', () => {
    const all = ACCESS_MODULES.flatMap(m => m.levels.flatMap(l => l.adds))
    for (const key of [...all, 'beheer']) {
      expect(withImpliedSections([key])).toContain(key)
      expect(getSections(user([key]))).toContain(key)
    }
  })

  it('een rol op Beheren geeft na herberekenen dezelfde sleutel als voorheen, plus bekijken', () => {
    const role: AccessRole = {
      id: 'productie', label: 'Productie', color: '#000', levels: { freelancers: 'beheren' }, sort_order: 0,
    }
    // Iemand met die rol en een sleutellijst van vóór "bekijken".
    const existing = { role: 'productie', permissions: { sections: STALE } }
    const meta = buildAppMetadata(existing, { clients: [] }, [role]) as { permissions: { sections: string[] } }
    expect(meta.permissions.sections).toContain('freelancers')
    expect(meta.permissions.sections).toContain('freelancers_bekijken')
  })

  it('een account van vóór de rollen houdt zijn sleutellijst als er iets anders aan verandert', () => {
    const meta = buildAppMetadata({ permissions: { sections: STALE } }, { clients: [] }, []) as { permissions: { sections: string[] } }
    expect(meta.permissions.sections).toEqual(STALE)
    expect(canManageFreelancers({ app_metadata: meta })).toBe(true)
  })

  it('de standaardrollen in de migraties staan op Beheren en houden dus hun recht', () => {
    for (const name of ['0064_access_roles.sql', '0065_access_roles_drie_rollen.sql']) {
      const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations', name), 'utf8')
      for (const m of sql.matchAll(/"freelancers":\s*"([a-z]+)"/g)) {
        expect(sectionsForLevels({ freelancers: m[1] })).toContain('freelancers')
      }
    }
  })

  it('de database aanvaardt beide sleutels om te lezen, en de oude om te wijzigen (0092)', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0092_freelancers_rls_niveaus.sql'), 'utf8')
    expect(sql).toMatch(/user_has_section\('freelancers_bekijken'\)\s*or public\.user_has_section\('freelancers'\)/)
    expect(sql).not.toMatch(/using \(true\)/)
    // Geen migratie op de accounts zelf: rechten volgen uit de bestaande sleutel.
    expect(sql).not.toMatch(/(update|insert into|delete from)\s+auth\.users|raw_app_meta_data/i)
  })
})
