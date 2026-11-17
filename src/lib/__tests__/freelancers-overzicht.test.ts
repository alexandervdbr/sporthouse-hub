import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DEFAULT_FILTERS, applyFilters, filtersFromParams, filtersToParams, formToBody, matchesSearch, nextSort,
  parseAmount, rateText, ratingText, seedForm, sortFreelancers, copyValue, telHref, linkLabel,
} from '@/components/freelancers/overzicht/logic'
import { collabStats } from '@/features/freelancers/lib/rows'
import type { Freelancer } from '@/components/freelancers/overzicht/types'

// Het freelanceroverzicht (docs/freelancers-overzicht.md, Fase 1): zoeken,
// filteren, sorteren, de URL, de weergave van tarief en beoordeling, het
// formulier, en dat "bekijken" geen enkele wijzigknop ziet.

const ROOT = path.resolve(__dirname, '../../..')
const labels = { video: 'Video', foto: 'Foto', 'grafisch-design': 'Grafisch Design', redacteur: 'Redacteur' }

let n = 0
const fl = (p: Partial<Freelancer>): Freelancer => ({
  id: `f${++n}`, name: 'X', email: null, phone: null, disciplines: [], status: 'kandidaat',
  rate_amount: null, rate_unit: null, rate_note: null, overall_rating: null, overall_rating_note: null,
  portfolio_links: [], notes: null, archived_at: null, created_at: '2026-01-01', collab: { avg: null, count: 0, scored: 0 }, ...p,
})

const jana = fl({ name: 'Jana Peeters', disciplines: ['video', 'foto'], status: 'vast', overall_rating: 4, rate_amount: 450, rate_unit: 'dag', collab: { avg: 4.3, count: 5, scored: 5 }, email: 'jana@x.be', phone: '0470 12 34 56' })
const tom = fl({ name: 'Tom Wouters', disciplines: ['redacteur'], status: 'proefopdracht', overall_rating: 3, rate_amount: 45, rate_unit: 'uur', notes: 'Snel en accuraat' })
const lien = fl({ name: 'Liën Claes', disciplines: ['grafisch-design'], status: 'kandidaat', rate_note: 'op aanvraag' })
const arch = fl({ name: 'Arne Archief', disciplines: ['video'], status: 'inactief', archived_at: '2026-05-01' })
const all = [tom, jana, arch, lien]

describe('zoeken', () => {
  it('zoekt op naam, discipline en notities, zonder hoofdletters of accenten', () => {
    expect(matchesSearch(lien, 'lien', labels)).toBe(true)
    expect(matchesSearch(lien, 'LIËN', labels)).toBe(true)
    expect(matchesSearch(lien, 'grafisch', labels)).toBe(true)
    expect(matchesSearch(tom, 'accuráát', labels)).toBe(true)
    expect(matchesSearch(jana, 'jana foto', labels)).toBe(true)
    expect(matchesSearch(jana, 'jana redacteur', labels)).toBe(false)
  })
})

describe('filteren', () => {
  it('standaard: iedereen behalve gearchiveerden', () => {
    expect(applyFilters(all, DEFAULT_FILTERS, labels).map(f => f.name)).toEqual(['Tom Wouters', 'Jana Peeters', 'Liën Claes'])
  })
  it('Wat (meerdere, of) en Status (meerdere, of), samen (en)', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, wat: ['video', 'redacteur'] }, labels).map(f => f.name)).toEqual(['Tom Wouters', 'Jana Peeters'])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, wat: ['video', 'redacteur'], statuses: ['vast'] }, labels).map(f => f.name)).toEqual(['Jana Peeters'])
  })
  it('gearchiveerd tonen', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, archief: true }, labels)).toHaveLength(4)
  })
})

describe('sorteren', () => {
  const names = (s: Parameters<typeof sortFreelancers>[1], d: 'asc' | 'desc') => sortFreelancers(all, s, d, labels).map(f => f.name)
  it('standaard op naam (A→Z, zonder accentgevoeligheid)', () => {
    expect(names('naam', 'asc')).toEqual(['Arne Archief', 'Jana Peeters', 'Liën Claes', 'Tom Wouters'])
    expect(names('naam', 'desc')).toEqual(['Tom Wouters', 'Liën Claes', 'Jana Peeters', 'Arne Archief'])
  })
  it('beoordeling hoog→laag; wie er geen heeft staat altijd achteraan', () => {
    expect(names('beoordeling', 'desc')).toEqual(['Jana Peeters', 'Tom Wouters', 'Arne Archief', 'Liën Claes'])
    expect(names('beoordeling', 'asc')).toEqual(['Tom Wouters', 'Jana Peeters', 'Arne Archief', 'Liën Claes'])
  })
  it('status in de volgorde vast, proef, nog niet getest, inactief', () => {
    expect(names('status', 'asc')).toEqual(['Jana Peeters', 'Tom Wouters', 'Liën Claes', 'Arne Archief'])
  })
  it('tarief: per eenheid gegroepeerd, zonder bedrag achteraan', () => {
    expect(names('tarief', 'asc')).toEqual(['Tom Wouters', 'Jana Peeters', 'Arne Archief', 'Liën Claes'])
  })
  it('een kolomkop: dezelfde keert om, een andere begint in zijn eigen richting', () => {
    expect(nextSort({ sort: 'naam', dir: 'asc' }, 'naam')).toEqual({ sort: 'naam', dir: 'desc' })
    expect(nextSort({ sort: 'naam', dir: 'desc' }, 'beoordeling')).toEqual({ sort: 'beoordeling', dir: 'desc' })
  })
})

describe('de URL', () => {
  it('leest en schrijft de filters; standaardwaarden blijven uit de URL', () => {
    const f = filtersFromParams(new URLSearchParams('q=jana&wat=video,foto&status=vast,onzin&archief=1&sort=tarief&dir=desc'))
    expect(f).toEqual({ q: 'jana', wat: ['video', 'foto'], statuses: ['vast'], archief: true, sort: 'tarief', dir: 'desc' })
    expect(filtersToParams(f)).toEqual({ q: 'jana', wat: 'video,foto', status: 'vast', archief: '1', sort: 'tarief', dir: null })
    expect(filtersToParams(DEFAULT_FILTERS)).toEqual({ q: null, wat: null, status: null, archief: null, sort: null, dir: null })
    expect(filtersFromParams(new URLSearchParams('sort=hack'))).toEqual(DEFAULT_FILTERS)
  })
})

describe('weergave', () => {
  it('tarief: bedrag + eenheid, anders de vrije tekst', () => {
    expect(rateText(jana)).toBe('€450/dag')
    expect(rateText({ rate_amount: 1250.5, rate_unit: 'project', rate_note: null })).toBe('€1.250,5/project')
    expect(rateText(lien)).toBe('op aanvraag')
    expect(rateText(arch)).toBeNull()
  })
  it('beoordeling: handmatig cijfer met het gemiddelde ernaast, nooit in de plaats', () => {
    expect(ratingText(jana)).toBe('★ 4 · samenwerkingen 4,3 (5)')
    expect(ratingText(tom)).toBe('★ 3')
    expect(ratingText({ overall_rating: null, collab: { avg: 4, count: 2, scored: 2 } })).toBe('samenwerkingen 4 (2)')
    expect(ratingText(lien)).toBeNull()
  })
  it('gemiddelde van de samenwerkingen: alleen scores 1–5, op één decimaal', () => {
    expect(collabStats([{ score: 4 }, { score: 5 }, { score: 4 }, { score: null }])).toEqual({ avg: 4.3, count: 4, scored: 3 })
    expect(collabStats([])).toEqual({ avg: null, count: 0, scored: 0 })
  })
  it('contact: tel-link zonder spaties, kopiëren geeft e-mail of anders het nummer', () => {
    expect(telHref('0470 12 34 56')).toBe('tel:0470123456')
    expect(copyValue(jana)).toBe('jana@x.be')
    expect(copyValue({ email: null, phone: '0470' })).toBe('0470')
    expect(copyValue({ email: null, phone: null })).toBeNull()
    expect(linkLabel({ url: 'https://www.vimeo.com/jana' })).toBe('vimeo.com')
    expect(linkLabel({ label: 'Reel', url: 'https://x.be' })).toBe('Reel')
  })
})

describe('het formulier', () => {
  it('bedragen zoals mensen ze typen', () => {
    expect(parseAmount('450')).toBe(450)
    expect(parseAmount('€ 450,50')).toBe(450.5)
    expect(parseAmount('1.200')).toBe(1200)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('veel')).toBeUndefined()
  })
  it('naam en minstens één discipline verplicht; tarief bedrag én eenheid; geldige links', () => {
    const f = seedForm(null)
    expect(f.status).toBe('kandidaat')
    expect(Object.keys(formToBody(f).errors).sort()).toEqual(['disciplines', 'name'])
    const bad = { ...f, name: 'Jan', disciplines: ['video'], rate_amount: '450', email: 'nee', portfolio_links: [{ label: '', url: 'vimeo.com/x' }] }
    expect(Object.keys(formToBody(bad).errors).sort()).toEqual(['email', 'portfolio', 'rate'])
  })
  it('de body bevat precies de velden van de API, leeg wordt null, e-mail in kleine letters', () => {
    const { body } = formToBody({ ...seedForm(jana), email: ' Jana@X.be ', notes: '  ', portfolio_links: [{ label: '', url: 'https://vimeo.com/j' }, { label: '', url: '' }] })
    expect(body).toEqual({
      name: 'Jana Peeters', disciplines: ['video', 'foto'], status: 'vast', phone: '0470 12 34 56', email: 'jana@x.be',
      rate_amount: 450, rate_unit: 'dag', rate_note: null, overall_rating: 4, overall_rating_note: null,
      portfolio_links: [{ url: 'https://vimeo.com/j' }], notes: null,
    })
  })
})

// ── "Bekijken" ziet geen wijzigknoppen (verborgen, niet uitgeschakeld) ─────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/freelancers',
  useSearchParams: () => new URLSearchParams(),
}))
const Panel = (await import('@/components/freelancers/overzicht/Panel')).default
const Overview = (await import('@/components/freelancers/overzicht/Overview')).default

const panel = (canManage: boolean, freelancer: Freelancer | null = jana) => renderToStaticMarkup(createElement(Panel, {
  freelancer, canManage, disciplines: [{ key: 'video', label: 'Video', sort: 1 }], clients: [],
  onClose: () => {}, onSaved: () => {}, onDeleted: () => {}, say: () => {},
}))

describe('bekijken en beheren', () => {
  it('bekijken: het paneel heeft geen Bewerken, Archiveren, Verwijderen of Toevoegen', () => {
    const html = panel(false)
    expect(html).toContain('Jana Peeters')
    expect(html).toContain('Bellen')
    for (const w of ['Bewerken', 'Archiveren', 'Verwijderen', 'Toevoegen', 'disabled']) expect(html).not.toContain(w)
  })
  it('beheren: het paneel heeft Bewerken, Archiveren en Verwijderen', () => {
    const html = panel(true)
    for (const w of ['Bewerken', 'Archiveren', 'Verwijderen']) expect(html).toContain(w)
  })
  it('bekijken: de pagina heeft geen "+ Freelancer"', () => {
    expect(renderToStaticMarkup(createElement(Overview, { canManage: false, clients: [] }))).not.toContain('Freelancer toevoegen')
    expect(renderToStaticMarkup(createElement(Overview, { canManage: true, clients: [] }))).toContain('Freelancer toevoegen')
  })
  it('"+ Freelancer" opent hetzelfde paneel, leeg en meteen als formulier', () => {
    const html = panel(true, null)
    expect(html).toContain('Nieuwe freelancer')
    expect(html).toContain('Toevoegen')
    expect(html).toContain('Naam *')
  })
})

// ── Migratie 0094 en de proefdraai ─────────────────────────────────────────

describe('migratie 0094 (samenwerkingen)', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0094_freelancer_projects_policies.sql'), 'utf8')
  const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  it('voegt insert- en update-policies toe op het niveau beheren', () => {
    expect(code).toMatch(/create policy "freelancers section can insert freelancer_projects"[\s\S]*?with check \(public\.user_has_section\('freelancers'\)\)/)
    expect(code).toMatch(/create policy "freelancers section can update freelancer_projects"[\s\S]*?using \(public\.user_has_section\('freelancers'\)\)[\s\S]*?with check \(public\.user_has_section\('freelancers'\)\)/)
  })
  it('maakt de verwijzing naar freelancers on delete cascade', () => {
    expect(code).toMatch(/foreign key \(freelancer_id\) references public\.freelancers\(id\) on delete cascade/)
  })
  it('verwijdert geen tabel, kolom of rij en raakt geen andere tabel', () => {
    expect(code).not.toMatch(/drop (table|column|view|function|type)|delete from|truncate/i)
    expect(code.match(/(alter table|on) public\.(\w+)/g)?.every(m => m.endsWith('freelancer_projects'))).toBe(true)
  })
  it('de proefdraai bevat de migratie letterlijk en draait alles terug', () => {
    const proef = fs.readFileSync(path.join(ROOT, 'supabase/freelancers/0094_proefdraai.sql'), 'utf8')
    expect(proef).toContain(sql.trim())
    expect(proef.indexOf('begin;')).toBeLessThan(proef.indexOf(sql.trim()))
    expect(proef.trim().split('\n').filter(l => l.trim() && !l.startsWith('--')).slice(-2)[0]).toBe('rollback;')
    expect(proef).not.toMatch(/^\s*commit\s*;/im)
  })
})
