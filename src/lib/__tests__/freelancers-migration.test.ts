import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migratie 0093 (freelancer-datamodel), haar dry-run en haar testscript.
// Er is geen database in de testomgeving; deze test leest de SQL en bewaakt
// de afspraken die uit het plan volgen (docs/freelancers-redesign.md):
//   - 0093 verwijdert niets
//   - de dry-run leest alleen
//   - migratie en dry-run rekenen met dezelfde regels
//   - review_avg wordt nergens opgeslagen; overall_rating wordt nooit automatisch gezet
//   - links en rate limits zijn alleen voor de service-role

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
// SQL zonder commentaar, zodat uitleg in de kop geen test laat slagen of falen.
const code = (sql: string) => sql.replace(/--[^\n]*/g, '')

const MIGRATION = code(read('supabase/migrations/0093_freelancers_datamodel.sql'))
const DRYRUN = code(read('supabase/freelancers/0093_dryrun.sql'))

describe('0093 — verwijdert niets', () => {
  it('geen drop table/column, truncate of delete van data', () => {
    expect(MIGRATION).not.toMatch(/drop\s+table/i)
    expect(MIGRATION).not.toMatch(/drop\s+column/i)
    expect(MIGRATION).not.toMatch(/truncate/i)
    // De enige delete is het opruimen van verlopen rate-limittellers.
    const deletes = [...MIGRATION.matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map(m => m[1])
    expect(deletes).toEqual(['public.public_rate_limits'])
  })

  it('houdt de oude kolommen en freelancer_projects', () => {
    for (const col of ['rating', 'tested', 'types', 'specialties', 'hourly_rate', 'price_info', 'portfolio_url', 'bio']) {
      expect(MIGRATION).not.toMatch(new RegExp(`drop\\s+column\\s+(if\\s+exists\\s+)?${col}\\b`, 'i'))
    }
    expect(MIGRATION).toMatch(/rename column created_by to created_by_email/)
  })

  it('stopt vóór elke wijziging bij dubbele e-mails, rating/score buiten 1–5 of een onbekende status', () => {
    const firstChange = MIGRATION.search(/create extension|alter table|create table/i)
    const guard = MIGRATION.indexOf('Migratie 0093 gestopt')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(firstChange)
    for (const what of ['dubbele e-mailadressen', 'rating buiten 1–5', 'projectscore buiten 1–5', 'onbekende opdrachtstatus']) {
      expect(MIGRATION).toContain(what)
    }
  })

  it('eindigt met een controle die afbreekt als een oude waarde geen plek kreeg', () => {
    const tail = MIGRATION.slice(MIGRATION.lastIndexOf('do $$'))
    for (const check of ['overall_rating', 'rate_amount', 'rate_note', 'portfolio_links', 'legacy_project_id', 'freelancer_reviews']) {
      expect(tail).toContain(check)
    }
    expect(tail).toMatch(/raise exception 'Controle 0093/)
  })
})

describe('0093 — zelfde regels in migratie en dry-run', () => {
  it('oude opdrachtstatus → nieuwe', () => {
    for (const [from, to] of [['nieuw', 'gedeeld'], ['in_behandeling', 'geaccepteerd']]) {
      expect(MIGRATION).toMatch(new RegExp(`when '${from}'\\s+then '${to}'`))
      expect(DRYRUN).toMatch(new RegExp(`when '${from}' then '${to}'`))
    }
  })

  it('getest → status', () => {
    for (const sql of [MIGRATION, DRYRUN]) {
      expect(sql).toMatch(/when 'ja' then 'vast'/)
      expect(sql).toMatch(/when 'weinig' then 'proefopdracht'/)
      expect(sql).toMatch(/else 'kandidaat'/)
    }
  })

  it('dezelfde 13 disciplines als de huidige tool', () => {
    const page = read('src/components/freelancers/FreelancersPage.tsx')
    const types = page.match(/const TYPES = \[([\s\S]*?)\] as const/)![1].match(/'([^']+)'/g)!.map(s => s.slice(1, -1))
    const labelsIn = (sql: string) => [...sql.matchAll(/\('([a-z0-9-]+)',\s*'([^']+)'/g)].map(m => m[2])
    const seed = MIGRATION.slice(MIGRATION.indexOf('insert into public.freelancer_disciplines'), MIGRATION.indexOf('on conflict (key) do nothing'))
    const disc = DRYRUN.slice(DRYRUN.indexOf('disc(key, label)'), DRYRUN.indexOf('fl as ('))
    expect(labelsIn(seed).sort()).toEqual([...types].sort())
    expect(labelsIn(disc).sort()).toEqual([...types].sort())
  })
})

describe('0093 — dry-run en testscript', () => {
  it('de dry-run leest alleen', () => {
    for (const kw of ['insert', 'update', 'delete', 'alter', 'create', 'drop', 'truncate', 'grant', 'revoke']) {
      expect(DRYRUN, kw).not.toMatch(new RegExp(`\\b${kw}\\b`, 'i'))
    }
  })

  it('de dry-run toont per tabel hoeveel rijen er nu staan', () => {
    for (const t of ['freelancers', 'freelancer_projects', 'freelancer_assignments', 'freelancer_assignment_files']) {
      expect(DRYRUN).toContain(`'1 rijen nu', '${t}'`)
    }
  })

  it('de dry-run toont per freelancer oude rating, overall_rating en review_avg', () => {
    for (const k of ['rating (oud)', 'overall_rating (na)', 'review_avg (na)']) expect(DRYRUN).toContain(k)
  })

  it('de dry-run hangt niet af van 0092 of 0093 (roept geen van hun functies aan)', () => {
    // to_regprocedure('…') zoekt alleen op of iets bestaat; buiten die
    // opzoeking mag geen enkele functie of view van 0092/0093 voorkomen.
    // Tekst tussen aanhalingstekens (labels zoals 'projectscores → freelancer_reviews') telt niet.
    const calls = DRYRUN.replace(/to_regprocedure\('[^']*'\)|to_regclass\('[^']*'\)/g, '').replace(/'[^']*'/g, "''")
    for (const fn of ['user_can_view_freelancers', 'freelancer_picker', 'user_has_section', 'public_rate_hit', 'freelancer_stats',
                      'freelancer_disciplines', 'freelancer_reviews', 'freelancer_links']) {
      expect(calls, fn).not.toContain(fn)
    }
    // Alleen opzoeken of ze bestaan, zonder ze aan te roepen.
    expect(DRYRUN).toContain("to_regprocedure('public.user_can_view_freelancers()')")
  })

  for (const file of ['0092_test.sql', '0093_test.sql']) {
    it(`${file} draait in begin … rollback en toont pas daarna "geslaagd"`, () => {
      const sql = code(read(`supabase/freelancers/${file}`)).trim()
      expect(sql).toMatch(/^begin;/)
      expect(sql).not.toMatch(/\bcommit\b/i)
      expect(sql).toMatch(/rollback;\s*select '[^']*geslaagd[^']*' as resultaat;$/)
    })
  }
})

// Elk stuk moet ná het vorige staan (zoeken vanaf de vorige vondst).
function inOrder(sql: string, parts: string[]) {
  let from = 0
  for (const part of parts) {
    const at = sql.indexOf(part, from)
    expect(at, `"${part}" ontbreekt of staat te vroeg`).toBeGreaterThan(-1)
    from = at + part.length
  }
}

describe('0092/0093 — volgorde en proefdraai', () => {
  it('0093 stopt met "draai eerst 0092" vóór er iets verandert', () => {
    const guard = MIGRATION.indexOf('draai eerst 0092')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(MIGRATION.search(/create extension|alter table|create table|create or replace function/i))
    for (const needed of ["to_regprocedure('public.user_can_view_freelancers()')", "to_regprocedure('public.freelancer_picker()')",
                          "'freelancers can view freelancers'", "'freelancers can view freelancer_projects'"]) {
      expect(MIGRATION.slice(0, guard + 200)).toContain(needed)
    }
  })

  it('geen migratie sluit zelf een transactie (anders zou een proefdraai iets laten staan)', () => {
    for (const m of ['0092_freelancers_rls_niveaus.sql', '0093_freelancers_datamodel.sql']) {
      expect(code(read(`supabase/migrations/${m}`))).not.toMatch(/^\s*(begin|commit|rollback|end)\s*;/im)
    }
  })

  it('de proefdraai-scripts zijn up-to-date met de migraties en testscripts', async () => {
    const mod = await import(path.join(ROOT, 'scripts/freelancers-proefdraai.mjs'))
    const expected: Record<string, string> = mod.buildAll()
    for (const [file, sql] of Object.entries(expected)) {
      expect(read(file), `${file} is verouderd — draai: node scripts/freelancers-proefdraai.mjs`).toBe(sql)
    }
  })

  it('0093_proefdraai: begin, stop als 0093 al bestaat, 0092, 0093, controles, rollback, en pas dan "geslaagd"', () => {
    const sql = read('supabase/freelancers/0093_proefdraai.sql')
    inOrder(sql, [
      '\nbegin;\n',
      'Proefdraai gestopt: 0093 is al uitgevoerd',
      'create or replace function public.user_can_view_freelancers()',
      'Migratie 0093 gestopt: draai eerst 0092',
      'create table if not exists public.freelancer_disciplines',
      'TEST MISLUKT',
      '\nrollback;\n',
      "select 'Proefdraai 0092 + 0093 geslaagd",
    ])
    // Precies één begin; en één rollback; op het hoogste niveau.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1)
    expect(sql.match(/^rollback;$/gm)).toHaveLength(1)
    expect(code(sql)).not.toMatch(/\bcommit\b/i)
  })

  it('0092_proefdraai: begin, 0092, controles, rollback, en pas dan "geslaagd"', () => {
    const sql = read('supabase/freelancers/0092_proefdraai.sql')
    inOrder(sql, ['\nbegin;\n', 'create policy "freelancers can view freelancers"', 'set local role authenticated',
                  'TEST MISLUKT', '\nrollback;\n', "select 'Proefdraai 0092 geslaagd"])
    expect(sql.match(/^begin;$/gm)).toHaveLength(1)
    expect(sql.match(/^rollback;$/gm)).toHaveLength(1)
    expect(code(sql)).not.toMatch(/\bcommit\b/i)
    expect(sql).not.toContain('freelancer_disciplines')  // 0093 hoort hier niet in
  })
})

describe('0093 — regels uit het plan', () => {
  it('review_avg is alleen een berekening in de view, nooit een kolom', () => {
    expect(MIGRATION).not.toMatch(/add column (if not exists )?review_avg/i)
    expect(MIGRATION).toMatch(/create or replace view public\.freelancer_stats\s+with \(security_invoker = true\)/)
  })

  it('overall_rating wordt alleen eenmalig overgenomen uit rating, door geen trigger of functie', () => {
    const sets = [...MIGRATION.matchAll(/overall_rating\s*=\s*([^,\n]+)/g)].map(m => m[1].trim())
    expect(sets).toEqual(['f.rating'])
    const functions = [...MIGRATION.matchAll(/create or replace function[\s\S]*?end \$\$;|create or replace function[\s\S]*?\$\$;/g)].map(m => m[0])
    for (const fn of functions) expect(fn).not.toMatch(/overall_rating\s*:?=/)
  })

  it('links en rate limits: RLS aan, geen enkele policy, functie alleen voor de service-role', () => {
    expect(MIGRATION).toMatch(/alter table public\.freelancer_links enable row level security/)
    expect(MIGRATION).toMatch(/alter table public\.public_rate_limits enable row level security/)
    expect(MIGRATION).not.toMatch(/on public\.(freelancer_links|public_rate_limits)\b[^;]*for (select|insert|update|delete|all)/i)
    expect(MIGRATION).not.toMatch(/'freelancer_links'|'public_rate_limits'/)  // niet in de policy-lus
    expect(MIGRATION).toMatch(/revoke all on function public\.public_rate_hit\(text, bytea, int, int\) from public, anon, authenticated/)
  })

  it('geen tokens of pincodes in plaintext: alleen hash, versleuteld en pin_hash', () => {
    const links = MIGRATION.slice(MIGRATION.indexOf('create table if not exists public.freelancer_links'))
    const cols = links.slice(0, links.indexOf(');')).match(/^\s+([a-z_]+)\s/gm)!.map(s => s.trim())
    expect(cols).not.toContain('token')
    expect(cols).not.toContain('pin')
    expect(cols).toEqual(expect.arrayContaining(['token_hash', 'token_encrypted', 'pin_hash']))
  })

  it('geen open policies (using true) en de lees-/schrijfniveaus van 0092', () => {
    expect(MIGRATION).not.toMatch(/using \(true\)|with check \(true\)/i)
    expect(MIGRATION).toContain('using (public.user_can_view_freelancers())')
    expect(MIGRATION).toContain("public.user_has_section(''freelancers'')")
  })

  it('0093_test.sql controleert de picker als gebruiker met alleen materiaalrecht: actief wel, gearchiveerd niet', () => {
    const t = read('supabase/freelancers/0093_test.sql')
    const block = t.slice(t.indexOf('"sections":["materiaal"]'))
    expect(block).toMatch(/freelancer_picker\(\) where name = 'TEST 0093 actief'/)
    expect(block).toMatch(/gearchiveerde freelancer staat in freelancer_picker/)
    // De gearchiveerde testfreelancer is vóór die controle gearchiveerd.
    expect(t.indexOf("set archived_at = now() where id = v_f")).toBeLessThan(t.indexOf('"sections":["materiaal"]'))
  })

  it('freelancer_picker laat gearchiveerde freelancers weg en geeft alleen id en naam', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('create or replace function public.freelancer_picker()'))
    expect(fn).toMatch(/returns table \(id uuid, name text\)/)
    expect(fn).toMatch(/and f\.archived_at is null/)
    expect(fn).toMatch(/security definer/)
  })
})
