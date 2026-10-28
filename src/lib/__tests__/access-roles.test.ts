import { describe, it, expect } from 'vitest'
import {
  ACCESS_MODULES, ALL_SECTION_KEYS, sectionsForLevels, effectiveLevels, cleanOverrides,
  levelsFromSections, allHighest, allLowest, slugifyRoleId, buildAppMetadata, locksOutCaller,
  type AccessRole,
} from '@/lib/access-roles'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

// De vakjes zoals ze in het beheerscherm stonden vóór de rollen. Elke sleutel
// hier wordt ergens in de app of de RLS gecontroleerd; als er één niet meer
// via een niveau te bereiken is, kan niemand dat recht nog krijgen.
const OUDE_VAKJES = [
  'beheer',
  'dashboard', 'projecten', 'team', 'chat', 'vergaderingen', 'welkom_stagiair', 'googlephotos',
  'planning', 'planning_volledig', 'planning_statistieken',
  'projectkalender', 'projectkalender_toevoegen', 'projectkalender_verwijderen',
  'contentkalender_toevoegen', 'contentkalender_verwijderen',
  'team_toevoegen', 'team_verwijderen',
  'freelancers',
  'bestanden_verwijderen',
  'kennisbank_bewerken',
  'preassist', 'preassist_beheer', 'preassist_toevoegen', 'preassist_verwijderen', 'preassist_downloaden',
  'materiaal', 'stats_materiaal', 'materiaal_toevoegen', 'materiaal_verwijderen', 'materiaal_reserveren',
  'reservering_verwijderen', 'materiaal_extern',
  'wachtwoorden_bekijken', 'wachtwoorden_toevoegen', 'wachtwoorden_verwijderen',
  'financien_bekijken', 'financien_beheren',
  'administratie_bekijken', 'administratie_beheren',
  'stijlvoorbeelden',
  'mijn-gedacht', 'mijn_gedacht_types_beheren',
]

describe('catalogus', () => {
  it('bereikt exact de oude vakjes, elk één keer', () => {
    expect([...ALL_SECTION_KEYS].sort()).toEqual([...OUDE_VAKJES].sort())
    expect(new Set(ALL_SECTION_KEYS).size).toBe(ALL_SECTION_KEYS.length)
  })

  it('heeft unieke onderdelen en per onderdeel unieke niveaus', () => {
    expect(new Set(ACCESS_MODULES.map(m => m.key)).size).toBe(ACCESS_MODULES.length)
    for (const m of ACCESS_MODULES) {
      expect(new Set(m.levels.map(l => l.key)).size).toBe(m.levels.length)
    }
  })
})

describe('sectionsForLevels', () => {
  it('telt de lagere niveaus mee', () => {
    const s = sectionsForLevels({ materiaal: 'reserveren' })
    expect(s).toContain('materiaal')
    expect(s).toContain('materiaal_reserveren')
    expect(s).not.toContain('materiaal_toevoegen')
  })

  it('geeft alles bij alle hoogste niveaus en niets bij de laagste', () => {
    expect([...sectionsForLevels(allHighest())].sort()).toEqual([...OUDE_VAKJES].sort())
    expect(sectionsForLevels(allLowest())).toEqual([])
  })

  it('valt bij een onbekend niveau terug op het laagste', () => {
    expect(sectionsForLevels({ materiaal: 'superadmin' })).not.toContain('materiaal')
    expect(sectionsForLevels(null)).toEqual([])
  })
})

describe('afwijkingen per persoon', () => {
  const rol = { planning: 'bekijken', materiaal: 'reserveren' }

  it('gaan boven de rol, in beide richtingen', () => {
    const eff = effectiveLevels(rol, { planning: 'bewerken', materiaal: 'geen' })
    expect(eff.planning).toBe('bewerken')
    expect(eff.materiaal).toBe('geen')
  })

  it('tellen niet als ze gelijk zijn aan de rol', () => {
    expect(cleanOverrides(rol, { planning: 'bekijken', materiaal: 'beheren' })).toEqual({ materiaal: 'beheren' })
  })

  it('negeren onbekende onderdelen en niveaus', () => {
    expect(cleanOverrides(rol, { bestaatniet: 'aan', planning: 'raar' })).toEqual({})
  })
})

describe('levelsFromSections', () => {
  it('leest een oude sleutellijst terug als niveaus', () => {
    const lv = levelsFromSections(['materiaal', 'materiaal_reserveren', 'reservering_verwijderen', 'beheer'])
    expect(lv.materiaal).toBe('reserveren')
    expect(lv.beheer).toBe('aan')
    expect(lv.planning).toBe('geen')
  })

  it('kiest het hoogste niveau waarvan alles er is, niet meer', () => {
    // materiaal_toevoegen zonder reserveren: de ladder stopt bij bekijken.
    expect(levelsFromSections(['materiaal', 'materiaal_toevoegen']).materiaal).toBe('bekijken')
  })

  it('is het omgekeerde van sectionsForLevels', () => {
    const lv = { ...allLowest(), planning: 'bewerken', preassist: 'bijdragen', beheer: 'aan' }
    expect(levelsFromSections(sectionsForLevels(lv))).toEqual(lv)
  })
})

describe('slugifyRoleId', () => {
  it('maakt een nette id', () => {
    expect(slugifyRoleId('Video Editor')).toBe('video-editor')
    expect(slugifyRoleId('Créatief  & co!')).toBe('creatief-co')
  })
})

describe('buildAppMetadata', () => {
  const roles: AccessRole[] = [
    { id: 'creator', label: 'Creator', color: '#000', sort_order: 1, levels: { planning: 'bekijken', chat: 'aan' } },
    { id: 'admin', label: 'Admin', color: '#000', sort_order: 2, levels: allHighest() },
  ]

  it('rekent rol plus afwijkingen om naar sleutels', () => {
    const meta = buildAppMetadata({}, { access_role: 'creator', overrides: { planning: 'bewerken' }, clients: [] }, roles)
    const sections = (meta.permissions as { sections: string[] }).sections
    expect(meta.role).toBe('creator')
    expect(meta.role_overrides).toEqual({ planning: 'bewerken' })
    expect(sections).toEqual(expect.arrayContaining(['chat', 'planning', 'planning_volledig']))
    expect(sections).not.toContain('beheer')
    expect(meta.allowed).toBe(true)
  })

  it('volgt de rol zoals hij nu is, bij opnieuw opbouwen zonder invoer', () => {
    const before = buildAppMetadata({}, { access_role: 'creator', clients: ['k1'] }, roles)
    const changed = roles.map(r => r.id === 'creator' ? { ...r, levels: { ...r.levels, materiaal: 'bekijken' } } : r)
    const after = buildAppMetadata(before, {}, changed)
    expect((after.permissions as { sections: string[] }).sections).toContain('materiaal')
    expect((after.permissions as { clients: string[] }).clients).toEqual(['k1'])
  })

  it('laat de sleutels van een oud account staan als alleen iets anders wijzigt', () => {
    const oud = { permissions: { sections: ['materiaal', 'materiaal_toevoegen'], clients: [] } }
    const meta = buildAppMetadata(oud, { clients: ['k2'] }, roles)
    expect((meta.permissions as { sections: string[] }).sections).toEqual(['materiaal', 'materiaal_toevoegen'])
  })

  it('bewaart wachtwoordkeuzes alleen voor wie wachtwoorden mag zien', () => {
    const zonder = buildAppMetadata({}, { access_role: 'creator', credentials: ['c1'] }, roles)
    const met = buildAppMetadata({}, { access_role: 'admin', credentials: ['c1'] }, roles)
    expect((zonder.permissions as Record<string, unknown>).credentials).toBeUndefined()
    expect((met.permissions as Record<string, unknown>).credentials).toEqual(['c1'])
  })
})

describe('locksOutCaller', () => {
  const zonderBeheer = { permissions: { sections: ['chat'] } }
  const metBeheer = { permissions: { sections: ['beheer'] } }

  it('weigert wie zichzelf Beheer afneemt', () => {
    expect(locksOutCaller({ id: 'a', email: 'x@y.be' }, 'a', zonderBeheer)).toBe(true)
    expect(locksOutCaller({ id: 'a', email: 'x@y.be' }, 'a', metBeheer)).toBe(false)
  })

  it('laat het toe voor iemand anders of voor een vaste admin', () => {
    expect(locksOutCaller({ id: 'a', email: 'x@y.be' }, 'b', zonderBeheer)).toBe(false)
    expect(locksOutCaller({ id: 'a', email: ADMIN_EMAILS[0] }, 'a', zonderBeheer)).toBe(false)
  })
})
