import { describe, it, expect, vi, beforeEach } from 'vitest'

// De API van het freelanceroverzicht (docs/freelancers-overzicht.md), met een
// nagemaakte Supabase. Wat hier getest wordt:
//   - zonder het juiste niveau een 401/403, vóór er iets naar de database gaat
//   - "bekijken" mag lezen maar nergens schrijven
//   - een account zonder permissions-object krijgt niets
//   - schrijfroutes weigeren elk veld dat niet in de whitelist staat
//   - een freelancer aanmaken maakt nooit een Auth-account
//   - opdrachten en samenwerkingen worden gezocht onder de freelancer uit de URL
//   - het gemiddelde van de samenwerkingen wordt nergens weggeschreven

type FakeUser = { id: string; email?: string; app_metadata: Record<string, unknown> } | null
type Result = { data?: unknown; error?: { code?: string; message?: string } | null }

const state: {
  user: FakeUser
  calls: string[]
  writes: { table: string; op: string; payload: unknown }[]
  /** Antwoord per tabel; een lijst = één antwoord per oproep, in volgorde. */
  tables: Record<string, Result | Result[]>
  createUser: number
} = { user: null, calls: [], writes: [], tables: {}, createUser: 0 }

function builder(table: string) {
  const result = (): Result => {
    const t = state.tables[table]
    return (Array.isArray(t) ? t.shift() : t) ?? { data: null, error: null }
  }
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'neq', 'is', 'not', 'in', 'lt', 'gt', 'gte', 'order', 'range', 'limit', 'ilike']) {
    q[m] = () => { state.calls.push(`${table}.${m}`); return q }
  }
  q.eq = (col: string, val: unknown) => { state.calls.push(`${table}.eq:${col}=${val}`); return q }
  for (const op of ['insert', 'update', 'delete', 'upsert']) {
    q[op] = (payload?: unknown) => { state.calls.push(`${table}.${op}`); state.writes.push({ table, op, payload }); return q }
  }
  q.single = async () => result()
  q.maybeSingle = async () => result()
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, ...result() })
  return q
}

function client() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      admin: { createUser: async () => { state.createUser++; return { data: {}, error: null } } },
    },
    from: (table: string) => builder(table),
    rpc: async (name: string) => { state.calls.push(`rpc:${name}`); return { data: [], error: null } },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client(), createAdminClient: () => client() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client() }))
vi.mock('@/lib/supabase/claims', () => ({ getSessionUser: async () => state.user }))

// De routes zijn getypeerd als Promise<Response | undefined> (zelfde als in
// poolwagens-routes.test.ts); in de praktijk is er altijd een antwoord.
type Fixed<T> = { [K in keyof T]: T[K] extends (...a: infer A) => Promise<unknown> ? (...a: A) => Promise<Response> : T[K] }
const fixed = <T,>(m: T) => m as unknown as Fixed<T>

const list = fixed(await import('@/app/api/freelancers/route'))
const one = fixed(await import('@/app/api/freelancers/[id]/route'))
const projects = fixed(await import('@/app/api/freelancers/[id]/projects/route'))
const project = fixed(await import('@/app/api/freelancers/[id]/projects/[projectId]/route'))
const archive = fixed(await import('@/app/api/freelancers/[id]/archive/route'))
const disciplines = fixed(await import('@/app/api/freelancers/disciplines/route'))
const importer = fixed(await import('@/app/api/freelancers/import/route'))

const F = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const P = '33333333-3333-4333-8333-333333333333'

const user = (sections: string[] | null): FakeUser => ({
  id: 'u1', email: 'collega@example.com',
  app_metadata: sections ? { permissions: { sections } } : {},
})
const VIEW = ['freelancers_bekijken']
const MANAGE_OLD = ['freelancers']                 // sleutellijst van vóór "bekijken"
const MANAGE = ['freelancers_bekijken', 'freelancers']
const NONE = ['team', 'planning']

const url = 'http://hub.test/api/freelancers/x'
const json = (method: string, body?: unknown, u = url) =>
  new Request(u, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const p1 = (id = F) => ({ params: Promise.resolve({ id }) })
const pp = () => ({ params: Promise.resolve({ id: F, projectId: P }) })

// Elke route, met het niveau dat ze vraagt.
const ROUTES: { name: string; level: 'bekijken' | 'beheren'; call: () => Promise<Response> }[] = [
  { name: 'GET /freelancers',              level: 'bekijken', call: () => list.GET(json('GET')) },
  { name: 'POST /freelancers',             level: 'beheren',  call: () => list.POST(json('POST', { name: 'Jan', disciplines: ['video'] })) },
  { name: 'POST archive',                  level: 'beheren',  call: () => archive.POST(json('POST'), p1()) },
  { name: 'DELETE archive',                level: 'beheren',  call: () => archive.DELETE(json('DELETE'), p1()) },
  { name: 'GET disciplines',               level: 'bekijken', call: () => disciplines.GET() },
  { name: 'POST disciplines',              level: 'beheren',  call: () => disciplines.POST(json('POST', { label: 'Drone' })) },
  { name: 'POST import',                   level: 'beheren',  call: () => importer.POST(json('POST', { new_disciplines: [], create: [{ line: 2, data: { name: 'Jan', disciplines: ['video'] } }], update: [] })) },
  { name: 'PATCH project',                 level: 'beheren',  call: () => project.PATCH(json('PATCH', { project_name: 'X' }), pp()) },
  { name: 'PATCH /freelancers/[id]',       level: 'beheren',  call: () => one.PATCH(json('PATCH', { name: 'Jan' }), p1()) },
  { name: 'DELETE /freelancers/[id]',      level: 'beheren',  call: () => one.DELETE(json('DELETE'), p1()) },
  { name: 'GET projects',                  level: 'bekijken', call: () => projects.GET(json('GET'), p1()) },
  { name: 'POST projects',                 level: 'beheren',  call: () => projects.POST(json('POST', { project_name: 'X' }), p1()) },
  { name: 'DELETE project',                level: 'beheren',  call: () => project.DELETE(json('DELETE'), pp()) },
]

const touchedData = () => state.calls.filter(c => !c.startsWith('rpc:'))

beforeEach(() => {
  state.user = null; state.calls = []; state.writes = []; state.tables = {}; state.createUser = 0
})

describe('freelancer-API — rechten', () => {
  for (const r of ROUTES) {
    it(`${r.name}: niet ingelogd → geweigerd, zonder database`, async () => {
      const res = await r.call()
      expect([401, 403]).toContain(res.status)
      expect(touchedData()).toEqual([])
    })

    it(`${r.name}: geen freelancerrecht → 403, zonder database`, async () => {
      state.user = user(NONE)
      expect((await r.call()).status).toBe(403)
      expect(touchedData()).toEqual([])
    })

    it(`${r.name}: geen permissions-object → 403 (geen open toegang)`, async () => {
      state.user = user(null)
      expect((await r.call()).status).toBe(403)
      expect(touchedData()).toEqual([])
    })

    if (r.level === 'beheren') {
      it(`${r.name}: bekijken → 403, zonder database`, async () => {
        state.user = user(VIEW)
        expect((await r.call()).status).toBe(403)
        expect(touchedData()).toEqual([])
      })
    } else {
      it(`${r.name}: bekijken → toegelaten`, async () => {
        state.user = user(VIEW)
        expect([401, 403]).not.toContain((await r.call()).status)
      })
    }

    it(`${r.name}: een oude sleutellijst ("freelancers") is beheren → toegelaten`, async () => {
      state.user = user(MANAGE_OLD)
      expect([401, 403]).not.toContain((await r.call()).status)
    })
  }
})

describe('freelancer-API — whitelist', () => {
  beforeEach(() => { state.user = user(MANAGE) })

  const forbidden: Record<string, unknown>[] = [
    { id: '99999999-9999-4999-8999-999999999999' },
    { created_at: '2020-01-01' },
    { avatar_url: 'https://evil.example/x.png' },
    { specialties: ['x'] },
    { hourly_rate: 1 },
    { name: 'Jan', is_admin: true },
    { rating: 9 },
    { email: 'geen-adres' },
    { portfolio_url: 'javascript:alert(1)' },
    { tested: 'misschien' },
    { archived_at: '2026-01-01' },
    { availability: 'beschikbaar' },
    { overall_rating: 7 },
    { overall_rating: 3.5 },
    { status: 'getest' },
    { disciplines: [] },
    { disciplines: ['Geen Sleutel'] },
    { rate_amount: 450 },
    { rate_unit: 'dag', rate_amount: null },
    { rate_unit: 'week', rate_amount: 1 },
    { portfolio_links: [{ url: 'javascript:alert(1)' }] },
    { portfolio_links: [{ url: 'https://x.be', extra: 1 }] },
    { overall_rating_updated_by: 'u1' },
  ]

  for (const body of forbidden) {
    it(`PATCH weigert ${JSON.stringify(body)} en schrijft niets`, async () => {
      const res = await one.PATCH(json('PATCH', body), p1())
      expect(res.status).toBe(400)
      expect(state.writes).toEqual([])
    })
  }

  it('PATCH zonder velden → 400', async () => {
    expect((await one.PATCH(json('PATCH', {}), p1())).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('PATCH met geen geldige JSON → 400', async () => {
    const req = new Request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{nee' })
    expect((await one.PATCH(req, p1())).status).toBe(400)
  })

  it('PATCH met toegelaten velden schrijft exact die velden, e-mail in kleine letters', async () => {
    state.tables.freelancers = { data: { id: F }, error: null }
    const res = await one.PATCH(json('PATCH', { name: ' Jan ', email: ' Jan@Example.COM ', notes: '' }), p1())
    expect(res.status).toBe(200)
    expect(state.writes).toEqual([{ table: 'freelancers', op: 'update', payload: { name: 'Jan', email: 'jan@example.com', notes: null } }])
  })

  it('POST weigert onbekende velden, en vraagt naam én minstens één discipline', async () => {
    expect((await list.POST(json('POST', { name: 'Jan', disciplines: ['video'], rating_note: 'x' }))).status).toBe(400)
    expect((await list.POST(json('POST', { email: 'a@b.be', disciplines: ['video'] }))).status).toBe(400)
    expect((await list.POST(json('POST', { name: 'Jan' }))).status).toBe(400)
    expect((await list.POST(json('POST', { name: 'Jan', disciplines: [] }))).status).toBe(400)
    expect((await list.POST(json('POST', { name: ' ', disciplines: ['video'] }))).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('PATCH met het hele formulier schrijft precies die velden', async () => {
    state.tables.freelancers = { data: { id: F, freelancer_projects: [{ score: 4 }, { score: 5 }, { score: null }] }, error: null }
    const body = {
      name: 'Jan', disciplines: ['video', 'foto', 'video'], status: 'vast', phone: '0470', email: 'JAN@x.be',
      rate_amount: 450, rate_unit: 'dag', rate_note: '€250 halve dag', overall_rating: 4, overall_rating_note: 'Sterk',
      portfolio_links: [{ label: '', url: 'https://vimeo.com/jan' }, { label: 'IG', url: 'https://instagram.com/jan' }], notes: 'n',
    }
    const res = await one.PATCH(json('PATCH', body), p1())
    expect(res.status).toBe(200)
    expect(state.writes[0].payload).toEqual({
      ...body, disciplines: ['video', 'foto'], email: 'jan@x.be',
      portfolio_links: [{ url: 'https://vimeo.com/jan' }, { label: 'IG', url: 'https://instagram.com/jan' }],
    })
    // Het gemiddelde komt mee in het antwoord, maar wordt nooit weggeschreven.
    expect(await res.json()).toMatchObject({ id: F, collab: { avg: 4.5, count: 3, scored: 2 } })
    expect(JSON.stringify(state.writes)).not.toMatch(/collab|"rating"/)
  })

  it('een dubbel e-mailadres is een 409 met een leesbare zin, zonder de databasemelding', async () => {
    state.tables.freelancers = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "freelancers_email_key"' } }
    const res = await one.PATCH(json('PATCH', { email: 'a@b.be' }), p1())
    expect(res.status).toBe(409)
    expect(await res.text()).toBe('Er bestaat al een freelancer met dit e-mailadres.')
  })

  it('samenwerking-PATCH weigert een score buiten 1–5 en een ander freelancer_id', async () => {
    expect((await project.PATCH(json('PATCH', { score: 0 }), pp())).status).toBe(400)
    expect((await project.PATCH(json('PATCH', { freelancer_id: F }), pp())).status).toBe(400)
    expect((await projects.POST(json('POST', { project_name: 'X', freelancer_id: F }), p1())).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('discipline-POST maakt een sleutel uit het label', async () => {
    state.tables.freelancer_disciplines = { data: { key: 'drone-pilot', label: 'Drone Piloot' }, error: null }
    const res = await disciplines.POST(json('POST', { label: 'Drone Pilöt' }))
    expect(res.status).toBe(201)
    expect(state.writes).toEqual([{ table: 'freelancer_disciplines', op: 'insert', payload: { key: 'drone-pilot', label: 'Drone Pilöt', sort: 10 } }])
  })

  it('project-POST weigert een score buiten 1–5', async () => {
    expect((await projects.POST(json('POST', { project_name: 'X', score: 7 }), p1())).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('een ongeldig id in de URL is een 404', async () => {
    expect((await one.PATCH(json('PATCH', { name: 'Jan' }), p1('../etc'))).status).toBe(404)
    expect((await project.PATCH(json('PATCH', { notes: 'x' }), { params: Promise.resolve({ id: F, projectId: 'x/../y' }) })).status).toBe(404)
    expect(state.writes).toEqual([])
  })
})

describe('freelancer-API — geen Auth-accounts meer', () => {
  it('POST met e-mailadres maakt het profiel, maar nooit een Auth-gebruiker', async () => {
    state.user = user(MANAGE)
    state.tables.freelancers = { data: { id: F, name: 'Jan' }, error: null }
    const res = await list.POST(json('POST', { name: 'Jan', disciplines: ['video'], email: 'jan@example.com' }))
    expect(res.status).toBe(201)
    expect(state.createUser).toBe(0)
    expect(state.writes).toEqual([{
      table: 'freelancers', op: 'insert',
      payload: { name: 'Jan', disciplines: ['video'], email: 'jan@example.com' },
    }])
  })

  it('in de broncode staat geen createUser meer voor freelancers', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('src/app/api/freelancers/route.ts', 'utf8')
    expect(src).not.toMatch(/createUser|app_metadata/)
  })
})

describe('freelancer-API — eigenaarschap', () => {
  beforeEach(() => { state.user = user(MANAGE) })

  it('samenwerking verwijderen en bewerken filtert op de freelancer uit de URL', async () => {
    await project.DELETE(json('DELETE'), pp())
    expect(state.calls).toContain(`freelancer_projects.eq:freelancer_id=${F}`)
    state.calls = []
    state.tables.freelancer_projects = { data: null, error: null }
    expect((await project.PATCH(json('PATCH', { notes: 'x' }), pp())).status).toBe(404)
    expect(state.calls).toContain(`freelancer_projects.eq:freelancer_id=${F}`)
  })

  it('een samenwerking toevoegen hangt ze aan de freelancer uit de URL en raakt de beoordeling niet', async () => {
    state.tables.freelancer_projects = { data: { id: P }, error: null }
    const res = await projects.POST(json('POST', { project_name: 'Aftermovie', client_name: 'KV Mechelen', date: '2026-10-12', score: 5 }), p1())
    expect(res.status).toBe(201)
    expect(state.writes).toEqual([{
      table: 'freelancer_projects', op: 'insert',
      payload: { project_name: 'Aftermovie', client_name: 'KV Mechelen', date: '2026-10-12', score: 5, freelancer_id: F },
    }])
  })

  it('de lijst laat gearchiveerden weg, tenzij ?archief=1', async () => {
    await list.GET(json('GET'))
    expect(state.calls).toContain('freelancers.is')
    state.calls = []
    await list.GET(json('GET', undefined, 'http://hub.test/api/freelancers?archief=1'))
    expect(state.calls).not.toContain('freelancers.is')
  })

  it('hard verwijderen zegt het als er nog iets naar de freelancer verwijst', async () => {
    state.tables.freelancers = { data: null, error: { code: '23503', message: 'fk' } }
    expect((await one.DELETE(json('DELETE'), p1())).status).toBe(409)
  })

})

describe('freelancer-API — importeren', () => {
  beforeEach(() => { state.user = user(MANAGE) })
  const body = (o: Record<string, unknown>) => json('POST', { new_disciplines: [], create: [], update: [], ...o })
  const row = (line: number, data: Record<string, unknown>) => ({ line, data })

  it('valideert elke rij opnieuw met de whitelist van het formulier', async () => {
    for (const bad of [
      body({ create: [row(2, { name: 'Jan' })] }),                                          // geen discipline
      body({ create: [row(2, { name: 'Jan', disciplines: ['video'], email: 'nee' })] }),   // ongeldig e-mailadres
      body({ create: [row(2, { name: 'Jan', disciplines: ['video'], rating: 4 })] }),      // oud veld
      body({ create: [row(2, { name: 'Jan', disciplines: ['video'], overall_rating: 7 })] }),
      body({ update: [{ line: 2, id: 'geen-uuid', data: { name: 'Jan' } }] }),
      body({ new_disciplines: [{ key: 'iets-anders', label: 'Drone' }] }),                 // sleutel volgt niet uit het label
      body({ extra: 1 }),
      body({}),                                                                              // niets te doen
    ]) expect((await importer.POST(bad)).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('voegt nieuwe disciplines toe die nog niet bestaan, en de freelancers in één keer', async () => {
    state.tables.freelancer_disciplines = { data: [{ key: 'video', label: 'Video', sort: 10 }], error: null }
    state.tables.freelancers = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    const res = await importer.POST(body({
      new_disciplines: [{ key: 'drone', label: 'Drone' }, { key: 'video', label: 'Video' }],
      create: [row(2, { name: 'Jan', disciplines: ['drone'] }), row(3, { name: 'An', disciplines: ['video'], email: 'AN@x.be' })],
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ toegevoegd: 2, bijgewerkt: 0, disciplines: 1, fouten: [] })
    expect(state.writes).toEqual([
      { table: 'freelancer_disciplines', op: 'insert', payload: [{ key: 'drone', label: 'Drone', sort: 20 }] },
      { table: 'freelancers', op: 'insert', payload: [{ name: 'Jan', disciplines: ['drone'] }, { name: 'An', disciplines: ['video'], email: 'an@x.be' }] },
    ])
  })

  it('faalt de groep, dan rij per rij: alleen de foute rij valt weg, met haar rijnummer', async () => {
    state.tables.freelancers = [
      { data: null, error: { code: '23505' } },          // de groep
      { data: { id: 'a' }, error: null },                // rij 2
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }, // rij 3
    ]
    const res = await importer.POST(body({ create: [row(2, { name: 'Jan', disciplines: ['video'] }), row(3, { name: 'An', disciplines: ['video'], email: 'an@x.be' })] }))
    expect(await res.json()).toEqual({ toegevoegd: 1, bijgewerkt: 0, disciplines: 0, fouten: [{ line: 3, message: 'Er bestaat al een freelancer met dit e-mailadres.' }] })
  })

  it('bijwerken schrijft alleen de opgestuurde velden, per freelancer uit de lijst', async () => {
    state.tables.freelancers = [{ data: { id: F }, error: null }, { data: null, error: null }]
    const res = await importer.POST(body({ update: [{ line: 4, id: F, data: { phone: '0470' } }, { line: 5, id: A, data: { notes: 'x' } }] }))
    expect(await res.json()).toEqual({ toegevoegd: 0, bijgewerkt: 1, disciplines: 0, fouten: [{ line: 5, message: 'Deze freelancer bestaat niet meer.' }] })
    expect(state.writes.map(w => w.payload)).toEqual([{ phone: '0470' }, { notes: 'x' }])
    expect(state.calls).toContain(`freelancers.eq:id=${F}`)
  })
})
