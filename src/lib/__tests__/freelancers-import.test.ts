import { describe, it, expect } from 'vitest'
import { parseCsv, toCsv, detectDelimiter } from '@/features/freelancers/lib/csv'
import {
  analyze, buildPlan, exportCsv, parseGetest, parsePortfolio, parsePrice, parseRating, parseWat, priceText,
  type DisciplineRef, type Existing, type ExportRow,
} from '@/features/freelancers/lib/spreadsheet'
import { freelancerCreateSchema, freelancerUpdateSchema } from '@/features/freelancers/lib/schemas'

// Importeren en exporteren in het formaat van de spreadsheet
// (docs/freelancers-overzicht.md §8.5–8.6): de mapping, vreemde
// prijsnotaties, lege velden, dubbels, en export → import geeft hetzelfde.

const D: DisciplineRef[] = [
  { key: 'video', label: 'Video' }, { key: 'foto', label: 'Foto' }, { key: 'foto-video', label: 'Foto/Video' },
  { key: 'video-vfx-motion', label: 'Video (vfx/motion)' }, { key: 'redacteur', label: 'Redacteur' }, { key: 'social-host', label: 'Social Host' },
]
const HEAD = 'Naam;Wat?;Nummer;Mailadres;Getest;Prijs;Beoordeling;Portfolio;Notities'
const ex = (p: Partial<Existing>): Existing => ({ id: 'x', name: 'X', email: null, archived_at: null, disciplines: [], portfolio_links: [], notes: null, ...p })

describe('CSV lezen', () => {
  it('; , of tab (geplakt uit een spreadsheet), aanhalingstekens, regeleinden in een cel, BOM, CRLF, lege rijen', () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"met ""quote"""\r\n;\r\n"twee\nregels";z')).toEqual([['a', 'b'], ['x;y', 'met "quote"'], ['twee\nregels', 'z']])
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(detectDelimiter('Naam;Wat?,x;y')).toBe(';')
  })
  it('schrijven en teruglezen geeft hetzelfde', () => {
    const rows = [['a;b', 'c"d', 'e\nf', ''], ['1', '2', '3', '4']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
    expect(toCsv([['x']]).startsWith('﻿')).toBe(true)
  })
})

describe('Getest', () => {
  it('ja → vast, weinig → proef, nee of leeg → nog niet getest', () => {
    expect(parseGetest('ja').status).toBe('vast')
    expect(parseGetest(' JA ').status).toBe('vast')
    expect(parseGetest('Weinig').status).toBe('proefopdracht')
    expect(parseGetest('nee').status).toBe('kandidaat')
    expect(parseGetest('').status).toBe('kandidaat')
    expect(parseGetest('').given).toBe(false)
    expect(parseGetest('inactief').status).toBe('inactief')
  })
  it('iets anders: nog niet getest, met een waarschuwing', () => {
    const r = parseGetest('misschien')
    expect(r.status).toBe('kandidaat')
    expect(r.warning).toMatch(/misschien/)
  })
})

describe('Prijs', () => {
  const ok = (s: string, amount: number, unit: string, note: string | null = null) =>
    expect(parsePrice(s), s).toEqual({ amount, unit, note, given: true })
  const note = (s: string) => expect(parsePrice(s), s).toEqual({ amount: null, unit: null, note: s.trim(), given: true })

  it('herkent één bedrag met één eenheid', () => {
    ok('€450/dag', 450, 'dag')
    ok('450 per dag', 450, 'dag')
    ok('€ 450 / dag', 450, 'dag')
    ok('dagprijs 450 euro', 450, 'dag')
    ok('45 €/u', 45, 'uur')
    ok('45/u', 45, 'uur')
    ok('€45 per uur', 45, 'uur')
    ok('uurtarief: 52,50', 52.5, 'uur')
    ok('1200 per project', 1200, 'project')
    ok('€1.200/project', 1200, 'project')
    ok('€1.250,5/project', 1250.5, 'project')
    ok('forfait 800', 800, 'project')
    ok('450 EUR/DAG', 450, 'dag')
  })
  it('extra tekst: bedrag en eenheid, en de originele tekst als notitie', () => {
    ok('€450/dag excl. btw', 450, 'dag', '€450/dag excl. btw')
  })
  it('alles wat niet eenduidig is, gaat volledig naar de notitie', () => {
    note('€450/dag, €250 halve dag')
    note('45-60/u')
    note('op aanvraag')
    note('450')
    note('€450')
    note('€250 per halve dag')
    note('450 per dag of 2000 per week')
    note('1,2,3 per dag')
    note('450 per dag/uur')
    note('gratis')
  })
  it('leeg is leeg', () => {
    expect(parsePrice('  ')).toEqual({ amount: null, unit: null, note: null, given: false })
  })
  it('wat we zelf exporteren ("€450/dag — €250 halve dag") komt terug als bedrag + notitie', () => {
    ok('€450/dag — €250 halve dag', 450, 'dag', '€250 halve dag')
  })
})

describe('Beoordeling', () => {
  it('alleen een geheel getal van 1 tot 5', () => {
    expect(parseRating('4').value).toBe(4)
    expect(parseRating('4/5').value).toBe(4)
    expect(parseRating('5,0').value).toBe(5)
    expect(parseRating('★★★').value).toBe(3)
    expect(parseRating('').value).toBeNull()
    for (const s of ['0', '6', '7', '4,5', 'goed', '8/10']) {
      const r = parseRating(s)
      expect(r.value, s).toBeNull()
      expect(r.warning, s).toBeTruthy()
    }
  })
})

describe('Wat?', () => {
  it('splitst op komma en slash; een label met slash blijft heel; zonder hoofdletters of accenten', () => {
    expect(parseWat('Video, Foto', D)).toEqual({ keys: ['video', 'foto'], unknown: [] })
    expect(parseWat('video / FOTO', D)).toEqual({ keys: ['video', 'foto'], unknown: [] })
    expect(parseWat('Foto/Video', D)).toEqual({ keys: ['foto-video'], unknown: [] })
    expect(parseWat('Video (vfx/motion), redacteur', D)).toEqual({ keys: ['video-vfx-motion', 'redacteur'], unknown: [] })
    expect(parseWat('social host', D)).toEqual({ keys: ['social-host'], unknown: [] })
  })
  it('onbekende waarden komen apart (één keer)', () => {
    expect(parseWat('Video, Drone, drone, Montage/Foto', D)).toEqual({ keys: ['video', 'foto'], unknown: ['Drone', 'Montage'] })
    expect(parseWat('', D)).toEqual({ keys: [], unknown: [] })
  })
})

describe('Portfolio', () => {
  it('elke URL wordt een link; www. krijgt https://; tekst zonder link blijft over', () => {
    expect(parsePortfolio('https://vimeo.com/jan, www.jan.be')).toEqual({ links: [{ url: 'https://vimeo.com/jan' }, { url: 'https://www.jan.be' }], rest: null })
    expect(parsePortfolio('zie instagram @jan')).toEqual({ links: [], rest: 'zie instagram @jan' })
    expect(parsePortfolio('')).toEqual({ links: [], rest: null })
  })
})

describe('een bestand analyseren', () => {
  const existing = [
    ex({ id: 'e1', name: 'Jana Peeters', email: 'jana@x.be', disciplines: ['video'], portfolio_links: [{ url: 'https://vimeo.com/jana' }], notes: 'Oud' }),
    ex({ id: 'e2', name: 'Tom Wouters', email: null }),
    ex({ id: 'e3', name: 'Piet Janssens', email: 'piet@a.be', archived_at: '2026-01-01' }),
  ]
  const csv = [
    HEAD,
    'Nieuwe Persoon;Video, Drone;0470 11 22 33;Nieuw@X.be;ja;€450/dag;4;https://vimeo.com/n;Goed',
    'JANA PEETERS;Foto;;JANA@x.be;;;;https://instagram.com/jana;',
    'Tom Wouters;Redacteur;;;weinig;op aanvraag;9;;',
    'Piet Janssens;Video;;andere@a.be;;;;;',
    'nieuwe persoon;Foto;;nieuw@x.be;;;;;',
    ';Video;;;;;;;',
    'Leeg Veld;;;;;;;;',
    'Rare Mail;Video;;geen-mail;;;;;',
  ].join('\n')
  const a = analyze(csv, D, existing)

  it('leest de kolommen, ook in een andere volgorde of met andere hoofdletters', () => {
    const b = analyze('MAILADRES,naam,WAT,Extra\na@b.be,Jan,video,x', D, [])
    expect(b.rows[0].data).toMatchObject({ name: 'Jan', email: 'a@b.be', disciplines: ['video'] })
    expect(b.ignoredColumns).toEqual(['Extra'])
  })
  it('zonder kolom Naam: een duidelijke fout, geen rijen', () => {
    expect(analyze('Wie;Wat?\nJan;Video', D, []).error).toMatch(/Naam/)
  })
  it('lege velden blijven leeg, met de standaardstatus', () => {
    const r = a.rows.find(r => r.data.name === 'Leeg Veld')!
    expect(r.data).toMatchObject({ disciplines: [], status: 'kandidaat', statusGiven: false, phone: null, email: null, overall_rating: null, portfolio_links: [], notes: null })
    expect(r.data.price.given).toBe(false)
  })
  it('een rij zonder naam is een fout', () => {
    expect(a.rows.find(r => r.line === 7)!.error).toBe('Geen naam')
  })
  it('dubbels met de bestaande lijst: op e-mail (zonder hoofdletters), anders op naam', () => {
    expect(a.rows.find(r => r.line === 3)!.match).toEqual({ id: 'e1', name: 'Jana Peeters', by: 'e-mail', archived: false })
    expect(a.rows.find(r => r.line === 4)!.match).toMatchObject({ id: 'e2', by: 'naam' })
  })
  it('dezelfde naam met een ander e-mailadres is een andere persoon', () => {
    expect(a.rows.find(r => r.line === 5)!.match).toBeUndefined()
  })
  it('dubbels in het bestand zelf', () => {
    expect(a.rows.find(r => r.line === 6)!.dupOf).toBe(2)
  })
  it('waarschuwingen: beoordeling buiten 1–5, onbekende discipline, prijs als notitie, ongeldig e-mailadres', () => {
    expect(a.rows.find(r => r.line === 4)!.warnings.join(' ')).toMatch(/Beoordeling "9"/)
    expect(a.rows.find(r => r.line === 4)!.warnings.join(' ')).toMatch(/Prijs niet eenduidig/)
    expect(a.rows.find(r => r.line === 2)!.warnings.join(' ')).toMatch(/Drone/)
    const rare = a.rows.find(r => r.data.name === 'Rare Mail')!
    expect(rare.data.email).toBeNull()
    expect(rare.data.notes).toBe('E-mail: geen-mail')
    expect(a.proposals).toEqual([{ label: 'Drone', lines: [2] }])
  })

  it('zonder keuzes: dubbels worden overgeslagen en er wordt niets bijgewerkt', () => {
    const p = buildPlan(a, {}, [], existing)
    expect(p.update).toEqual([])
    expect(p.skipped.map(s => s.line)).toEqual([3, 4, 6, 7, 8])
    expect(p.create.map(c => c.line)).toEqual([2, 5, 9])
  })
  it('een onbekende discipline: aangevinkt wordt ze toegevoegd, anders staat ze in de notities', () => {
    const yes = buildPlan(a, {}, ['Drone'], existing)
    expect(yes.newDisciplines).toEqual([{ key: 'drone', label: 'Drone' }])
    expect(yes.create[0].data).toMatchObject({ disciplines: ['video', 'drone'], notes: 'Goed' })
    const no = buildPlan(a, {}, [], existing)
    expect(no.newDisciplines).toEqual([])
    expect(no.create[0].data).toMatchObject({ disciplines: ['video'], notes: 'Goed\nWat?: Drone' })
  })
  it('een nieuwe rij heeft precies de velden van het formulier, en de server aanvaardt ze', () => {
    const p = buildPlan(a, {}, ['Drone'], existing)
    expect(p.create[0].data).toEqual({
      name: 'Nieuwe Persoon', disciplines: ['video', 'drone'], status: 'vast', phone: '0470 11 22 33', email: 'nieuw@x.be',
      rate_amount: 450, rate_unit: 'dag', rate_note: null, overall_rating: 4,
      portfolio_links: [{ url: 'https://vimeo.com/n' }], notes: 'Goed',
    })
    for (const c of p.create) expect(freelancerCreateSchema.safeParse(c.data).success, `rij ${c.line}`).toBe(true)
  })
  it('bijwerken: lege cellen overschrijven niets; Wat?, portfolio en notities worden samengevoegd', () => {
    const p = buildPlan(a, { 3: 'bijwerken', 4: 'bijwerken' }, [], existing)
    expect(p.update).toEqual([
      { line: 3, id: 'e1', data: { name: 'JANA PEETERS', disciplines: ['video', 'foto'], email: 'jana@x.be', portfolio_links: [{ url: 'https://vimeo.com/jana' }, { url: 'https://instagram.com/jana' }] } },
      { line: 4, id: 'e2', data: { name: 'Tom Wouters', disciplines: ['redacteur'], status: 'proefopdracht', rate_amount: null, rate_unit: null, rate_note: 'op aanvraag', notes: 'Beoordeling: 9' } },
    ])
    for (const u of p.update) expect(freelancerUpdateSchema.safeParse(u.data).success, `rij ${u.line}`).toBe(true)
  })
  it('een rij zonder Wat? kan niet nieuw toegevoegd worden', () => {
    expect(buildPlan(a, {}, [], existing).skipped.find(s => s.line === 8)!.reason).toMatch(/Geen Wat\?/)
  })
})

describe('exporteren', () => {
  const labels = Object.fromEntries(D.map(d => [d.key, d.label]))
  const list: ExportRow[] = [
    { name: 'Jana; "J" Peeters', disciplines: ['video', 'foto-video'], phone: '0470 12 34 56', email: 'jana@x.be', status: 'vast', rate_amount: 450, rate_unit: 'dag', rate_note: '€250 halve dag', overall_rating: 4, portfolio_links: [{ url: 'https://vimeo.com/j' }, { label: 'IG', url: 'https://instagram.com/j' }], notes: 'Twee\nregels' },
    { name: 'Tom', disciplines: ['redacteur'], phone: null, email: null, status: 'proefopdracht', rate_amount: 45.5, rate_unit: 'uur', rate_note: null, overall_rating: null, portfolio_links: [], notes: null },
    { name: 'Lien', disciplines: ['social-host'], phone: null, email: 'lien@x.be', status: 'kandidaat', rate_amount: null, rate_unit: null, rate_note: 'op aanvraag', overall_rating: 2, portfolio_links: [], notes: null },
    { name: 'Sofie', disciplines: ['video'], phone: null, email: null, status: 'inactief', rate_amount: 1250, rate_unit: 'project', rate_note: '€1.250/project excl. btw', overall_rating: null, portfolio_links: [], notes: null },
  ]
  const csv = exportCsv(list, labels)

  it('dezelfde kolommen als de spreadsheet, met ; en een BOM', () => {
    expect(csv.startsWith('﻿Naam;Wat?;Nummer;Mailadres;Getest;Prijs;Beoordeling;Portfolio;Notities\r\n')).toBe(true)
    expect(parseCsv(csv)[2]).toEqual(['Tom', 'Redacteur', '', '', 'weinig', '€45,5/uur', '', '', ''])
  })
  it('prijs: bedrag/eenheid, plus de notitie erachter', () => {
    expect(priceText(list[0])).toBe('€450/dag — €250 halve dag')
    expect(priceText(list[2])).toBe('op aanvraag')
    expect(priceText(list[3])).toBe('€1.250/project excl. btw')
  })
  it('exporteren en weer importeren geeft dezelfde freelancers (behalve portfoliolabels)', () => {
    const a = analyze(csv, D, [])
    // Alleen "op aanvraag" is (terecht) een notitie zonder bedrag.
    expect(a.rows.flatMap(r => [...r.warnings, r.error].filter(Boolean).map(w => `${r.data.name}: ${w}`))).toEqual(['Lien: Prijs niet eenduidig → volledig als notitie bij het tarief'])
    const back = buildPlan(a, {}, [], []).create.map(c => c.data)
    expect(back).toEqual(list.map(f => ({
      name: f.name, disciplines: f.disciplines, status: f.status, phone: f.phone, email: f.email,
      rate_amount: f.rate_amount, rate_unit: f.rate_unit, rate_note: f.rate_note, overall_rating: f.overall_rating,
      portfolio_links: f.portfolio_links.map(l => ({ url: l.url })), notes: f.notes,
    })))
  })
})

// ── Zoals Google Sheets onze kolommen exporteert ───────────────────────────

describe('Google Sheets', () => {
  it('Getest als vinkje: TRUE → vast, FALSE of leeg → nog niet getest; ja/weinig/nee blijven werken', () => {
    expect(parseGetest('TRUE')).toEqual({ status: 'vast', given: true })
    expect(parseGetest('true').status).toBe('vast')
    expect(parseGetest('FALSE')).toEqual({ status: 'kandidaat', given: false })
    expect(parseGetest('')).toEqual({ status: 'kandidaat', given: false })
    expect(parseGetest('ja').status).toBe('vast')
    expect(parseGetest('weinig').status).toBe('proefopdracht')
    expect(parseGetest('nee')).toEqual({ status: 'kandidaat', given: true })
  })
  it('Getest met andere tekst: nog niet getest, en de tekst bij de notities', () => {
    expect(parseGetest('één keer')).toMatchObject({ status: 'kandidaat', note: 'Getest: één keer' })
  })

  it('Beoordeling in sterren: de gevulde sterren tellen; geen enkele gevulde ster → leeg', () => {
    expect(parseRating('★★★☆☆')).toEqual({ value: 3, links: [], note: null })
    expect(parseRating('★★★★★')).toEqual({ value: 5, links: [], note: null })
    expect(parseRating('★☆☆☆☆').value).toBe(1)
    expect(parseRating('★ ★ ☆').value).toBe(2)
    expect(parseRating('☆☆☆☆☆')).toEqual({ value: null, links: [], note: null })
    expect(parseRating('4')).toEqual({ value: 4, links: [], note: null })
  })
  it('Beoordeling zonder sterren of cijfer: links naar het portfolio, tekst naar de notities, met een waarschuwing', () => {
    const r = parseRating('Mag niet voor Pro League werken')
    expect(r).toMatchObject({ value: null, links: [], note: 'Beoordeling: Mag niet voor Pro League werken' })
    expect(r.warning).toMatch(/geen cijfer of sterren/)
    const l = parseRating('Top! https://vimeo.com/reel')
    expect(l).toMatchObject({ value: null, links: [{ url: 'https://vimeo.com/reel' }], note: 'Beoordeling: Top!' })
    expect(parseRating('https://youtu.be/x')).toMatchObject({ links: [{ url: 'https://youtu.be/x' }], note: null })
    expect(parseRating('4,5').note).toBe('Beoordeling: 4,5')
    expect(parseRating('8/10').note).toBe('Beoordeling: 8/10')
  })

  it('Prijs "?" of "-" blijft leeg (geen notitie)', () => {
    for (const s of ['?', '-', ' - ', '??', '–', '—']) expect(parsePrice(s), s).toEqual({ amount: null, unit: null, note: null, given: false })
    expect(parsePrice('? per dag').note).toBe('? per dag')
  })

  it('"Motion Designer" in Wat? is de bestaande discipline "Video (vfx/motion)"', () => {
    expect(parseWat('Motion Designer', D)).toEqual({ keys: ['video-vfx-motion'], unknown: [] })
    expect(parseWat('motion designer, Video', D)).toEqual({ keys: ['video-vfx-motion', 'video'], unknown: [] })
    // Zonder die discipline in de lijst: gewoon een voorstel, zoals elke onbekende waarde.
    expect(parseWat('Motion Designer', D.filter(d => d.key !== 'video-vfx-motion'))).toEqual({ keys: [], unknown: ['Motion Designer'] })
  })

  it('een volledige Sheets-export: geen enkele cel gaat verloren', () => {
    const csv = [
      'Naam,Wat?,Nummer,Mailadres,Getest,Prijs,Beoordeling,Portfolio,Notities,Regio',
      'An Jacobs,Motion Designer,0470 1,an@x.be,TRUE,?,★★★☆☆,https://behance.net/an,Snel,Antwerpen',
      'Bo Smet,Foto,,bo@x.be,FALSE,-,Mag niet voor Pro League werken https://vimeo.com/bo,,Notitie,',
      'Cas Peeters,Video,,,FALSE,450 per dag,☆☆☆☆☆,,,Gent',
    ].join('\n')
    const a = analyze(csv, D, [])
    const [an, bo, cas] = a.rows.map(r => r.data)
    expect(an).toMatchObject({ disciplines: ['video-vfx-motion'], unknown: [], status: 'vast', overall_rating: 3, notes: 'Snel\nRegio: Antwerpen' })
    expect(an.price.given).toBe(false)
    expect(bo).toMatchObject({ status: 'kandidaat', statusGiven: false, overall_rating: null, portfolio_links: [{ url: 'https://vimeo.com/bo' }], notes: 'Notitie\nBeoordeling: Mag niet voor Pro League werken' })
    expect(a.rows[1].warnings.join(' ')).toMatch(/Beoordeling .* geen cijfer of sterren/)
    expect(cas).toMatchObject({ overall_rating: null, notes: 'Regio: Gent' })
    expect(cas.price).toMatchObject({ amount: 450, unit: 'dag' })
    expect(a.proposals).toEqual([])
    expect(a.ignoredColumns).toEqual(['Regio'])

    // Elke niet-lege cel staat ergens in wat er opgeslagen wordt.
    const saved = JSON.stringify(buildPlan(a, {}, [], []).create.map(c => c.data)).toLowerCase()
    const cells = csv.split('\n').slice(1).flatMap(l => l.split(','))
      .filter(c => c && !['TRUE', 'FALSE', '?', '-'].includes(c) && !/^[★☆]+$/.test(c))
    const words = cells.flatMap(c => c.split(' ').filter(w => w.length > 2 && !['per', 'dag', 'Designer', 'Motion'].includes(w)))
    expect(words.filter(w => !saved.includes(w.toLowerCase()))).toEqual([])
  })

  it('bijwerken met een leeg vinkje (FALSE) zet de status niet terug', () => {
    const a = analyze('Naam,Wat?,Getest\nJan,Video,FALSE', D, [ex({ id: 'j', name: 'Jan' })])
    expect(buildPlan(a, { 2: 'bijwerken' }, [], [ex({ id: 'j', name: 'Jan' })]).update[0].data).not.toHaveProperty('status')
  })
})

