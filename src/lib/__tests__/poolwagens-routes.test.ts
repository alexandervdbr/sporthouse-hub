import { describe, it, expect, vi, beforeEach } from 'vitest'

// De API-routes van het wagenbeheer, met een nagemaakte Supabase: een
// niet-beheerder krijgt een 403 nog vóór er iets naar de database gaat,
// ook bij een rechtstreekse API-call. (De database weigert het daarna nog
// eens via RLS; dat test supabase/poolwagens/0076_test.sql.)

type FakeUser = { id: string; email?: string; app_metadata: Record<string, unknown> } | null

const state: { user: FakeUser; dbCalls: string[] } = { user: null, dbCalls: [] }

function fakeQuery(table: string) {
  const result = { data: { id: 'car-1', name: 'Bus' }, error: null }
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order']) {
    q[m] = (...args: unknown[]) => { state.dbCalls.push(`${table}.${m}`); void args; return q }
  }
  q.single = async () => result
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => fakeQuery(table),
  }),
  createAdminClient: () => { throw new Error('de service-sleutel hoort hier niet gebruikt te worden') },
}))

const carsRoute = await import('@/app/api/poolwagens/cars/route')
const carRoute = await import('@/app/api/poolwagens/cars/[id]/route')

const user = (sections: string[] | null, extra: Record<string, unknown> = {}): FakeUser => ({
  id: 'u1',
  email: 'collega@example.com',
  app_metadata: { ...(sections ? { permissions: { sections } } : {}), ...extra },
})

const json = (url: string, method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

// Het resultaattype van de routes is Response | undefined (zelfde patroon als
// de gear-routes); in de praktijk is er altijd een antwoord.
const statusOf = async (r: Promise<Response | undefined>) => (await r)?.status

const params = { params: Promise.resolve({ id: 'car-1' }) }
const newCar = { name: 'Bus', license_plate: '1-ABC-234' }

beforeEach(() => { state.user = null; state.dbCalls = [] })

describe('wagenbeheer — rechten in de API', () => {
  it('niet ingelogd: 401', async () => {
    expect(await statusOf(carsRoute.GET(json('http://x/api/poolwagens/cars', 'GET')))).toBe(401)
    expect(await statusOf(carsRoute.POST(json('http://x/api/poolwagens/cars', 'POST', newCar)))).toBe(401)
  })

  it('gebruiker zonder beheer: kan de wagens zien, niet toevoegen of wijzigen', async () => {
    state.user = user(['poolwagens'])
    expect(await statusOf(carsRoute.GET(json('http://x/api/poolwagens/cars', 'GET')))).toBe(200)
    state.dbCalls = []

    expect(await statusOf(carsRoute.POST(json('http://x/api/poolwagens/cars', 'POST', newCar)))).toBe(403)
    expect(await statusOf(carRoute.PATCH(json('http://x/api/poolwagens/cars/car-1', 'PATCH', { manual_block: true }), params))).toBe(403)
    expect(await statusOf(carRoute.PATCH(json('http://x/api/poolwagens/cars/car-1', 'PATCH', { archived: true }), params))).toBe(403)
    // Gearchiveerde wagens lijsten is ook beheer.
    expect(await statusOf(carsRoute.GET(json('http://x/api/poolwagens/cars?archived=1', 'GET')))).toBe(403)
    expect(state.dbCalls).toEqual([])
  })

  it('account zonder rechten en freelancer: ook geen inzage', async () => {
    for (const u of [user(null), user(['poolwagens', 'poolwagens_beheren'], { freelancer: true })]) {
      state.user = u
      expect(await statusOf(carsRoute.GET(json('http://x/api/poolwagens/cars', 'GET')))).toBe(403)
      expect(await statusOf(carsRoute.POST(json('http://x/api/poolwagens/cars', 'POST', newCar)))).toBe(403)
    }
    expect(state.dbCalls).toEqual([])
  })

  it('beheerder: mag toevoegen en wijzigen', async () => {
    state.user = user(['poolwagens', 'poolwagens_beheren'])
    expect(await statusOf(carsRoute.POST(json('http://x/api/poolwagens/cars', 'POST', newCar)))).toBe(201)
    expect(await statusOf(carRoute.PATCH(json('http://x/api/poolwagens/cars/car-1', 'PATCH', { manual_block: true }), params))).toBe(200)
    expect(state.dbCalls).toContain('pool_cars.insert')
    expect(state.dbCalls).toContain('pool_cars.update')
  })

  it('beheerder met ongeldige invoer: 400 zonder databaseverzoek', async () => {
    state.user = user(['beheer'])
    expect(await statusOf(carsRoute.POST(json('http://x/api/poolwagens/cars', 'POST', { name: 'Bus' })))).toBe(400)
    expect(state.dbCalls).toEqual([])
  })
})
