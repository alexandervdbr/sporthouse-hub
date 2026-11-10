import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// De API-routes van Poolwagens, met een nagemaakte Supabase. Wat hier getest
// wordt: wie een 401/403 krijgt nog vóór er iets naar de database gaat (ook
// bij een rechtstreekse API-call), dat de routes de juiste databasefunctie
// aanroepen, en hoe fouten van de database bij de gebruiker aankomen. De
// regels in de database zelf testen de SQL-scripts in supabase/poolwagens/.

type FakeUser = { id: string; email?: string; app_metadata: Record<string, unknown> } | null
type Result = { data?: unknown; error?: { code?: string; message?: string } | null }

const state: {
  user: FakeUser
  calls: string[]
  rpcArgs: Record<string, unknown>
  rpc: Record<string, Result>
  tables: Record<string, Result>
} = { user: null, calls: [], rpcArgs: {}, rpc: {}, tables: {} }

function builder(table: string) {
  const result = () => state.tables[table] ?? { data: null, error: null }
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'not', 'in', 'lt', 'gt', 'gte', 'order', 'range', 'limit', 'ilike']) {
    q[m] = () => { state.calls.push(`${table}.${m}`); return q }
  }
  q.or = (filter: string) => { state.calls.push(`${table}.or:${filter}`); return q }
  q.single = async () => result()
  q.maybeSingle = async () => result()
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, ...result() })
  return q
}

function client() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      admin: { listUsers: async () => ({ data: { users: [] }, error: null }) },
    },
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => {
      state.calls.push(`rpc:${name}`)
      state.rpcArgs[name] = args
      return { data: null, error: null, ...state.rpc[name] }
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => client(),
  createAdminClient: () => client(),
}))

// De mail-worker weigert elke verzendpoging, zoals bij een verkeerd geheim.
// De melding moet dan gewoon blijven bestaan.
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, error: 'Geen toegang.' })))
vi.mock('googleapis', () => ({ google: { auth: { JWT: class { constructor() {} } }, drive: () => ({}) } }))

const cars = await import('@/app/api/poolwagens/cars/route')
const car = await import('@/app/api/poolwagens/cars/[id]/route')
const reservations = await import('@/app/api/poolwagens/reservations/route')
const reservation = await import('@/app/api/poolwagens/reservations/[id]/route')
const now = await import('@/app/api/poolwagens/reservations/now/route')
const arrival = await import('@/app/api/poolwagens/reservations/[id]/arrival/route')
const damage = await import('@/app/api/poolwagens/damage/route')
const damageStatus = await import('@/app/api/poolwagens/damage/[id]/route')
const liftBlock = await import('@/app/api/poolwagens/damage/[id]/lift-block/route')
const notify = await import('@/app/api/poolwagens/damage/[id]/notify/route')
const settings = await import('@/app/api/poolwagens/settings/route')
const mailTest = await import('@/app/api/poolwagens/mail-test/route')
const planning = await import('@/app/api/poolwagens/planning/route')
const fuelCards = await import('@/app/api/poolwagens/fuel-cards/route')
const fuelCard = await import('@/app/api/poolwagens/cars/[id]/fuel-card/route')
const pin = await import('@/app/api/poolwagens/cars/[id]/pin/route')
const history = await import('@/app/api/poolwagens/history/route')

const CAR = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'

const user = (sections: string[] | null, extra: Record<string, unknown> = {}): FakeUser => ({
  id: 'u1',
  email: 'collega@example.com',
  app_metadata: { ...(sections ? { permissions: { sections } } : {}), ...extra },
})
const USER = ['poolwagens']
const MANAGER = ['poolwagens', 'poolwagens_beheren']

const json = (method: string, body?: unknown, url = 'http://hub.test/api/poolwagens/x') =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const params = (id = 'id-1') => ({ params: Promise.resolve({ id }) })
// Het resultaattype van de routes is Response | undefined (zelfde patroon als
// de gear-routes); in de praktijk is er altijd een antwoord.
const answer = async (r: Promise<Response | undefined>) => { const res = (await r)!; return { status: res.status, text: await res.text() } }
const statusOf = async (r: Promise<Response | undefined>) => (await answer(r)).status

const newCar = { name: 'Bus', license_plate: '1-ABC-234' }
const booking = { car_id: CAR, start: '2026-12-01T08:00', end: '2026-12-01T17:00' }

beforeEach(() => {
  state.user = null; state.calls = []; state.rpcArgs = {}; state.rpc = {}; state.tables = {}
})

describe('wagenbeheer — rechten', () => {
  it('niet ingelogd: 401', async () => {
    expect(await statusOf(cars.GET(json('GET')))).toBe(401)
    expect(await statusOf(cars.POST(json('POST', newCar)))).toBe(401)
    expect(await statusOf(reservations.POST(json('POST', booking)))).toBe(401)
  })

  it('gebruiker zonder beheer: wagens zien, niet toevoegen, wijzigen of archiveren', async () => {
    state.user = user(USER)
    expect(await statusOf(cars.GET(json('GET')))).toBe(200)
    state.calls = []
    expect(await statusOf(cars.POST(json('POST', newCar)))).toBe(403)
    expect(await statusOf(car.PATCH(json('PATCH', { manual_block: true }), params()))).toBe(403)
    expect(await statusOf(car.PATCH(json('PATCH', { archived: true }), params()))).toBe(403)
    expect(await statusOf(cars.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/cars?archived=1')))).toBe(403)
    expect(state.calls).toEqual([])
  })

  it('account zonder rechten en freelancer: nergens bij', async () => {
    for (const u of [user(null), user(MANAGER, { freelancer: true }), user([])]) {
      state.user = u
      expect(await statusOf(cars.GET(json('GET')))).toBe(403)
      expect(await statusOf(reservations.POST(json('POST', booking)))).toBe(403)
      expect(await statusOf(damage.POST(json('POST', { car_id: CAR, description: 'x', severity: 'licht' })))).toBe(403)
      expect(await statusOf(planning.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/planning?month=2026-11')))).toBe(403)
    }
    expect(state.calls).toEqual([])
  })

  it('beheerder: toevoegen en wijzigen; ongeldige invoer is een 400 zonder databaseverzoek', async () => {
    state.user = user(MANAGER)
    state.tables.pool_cars = { data: { id: 'car-1', name: 'Bus' } }
    expect(await statusOf(cars.POST(json('POST', newCar)))).toBe(201)
    expect(await statusOf(car.PATCH(json('PATCH', { manual_block: true }), params()))).toBe(200)
    expect(state.calls).toEqual(expect.arrayContaining(['pool_cars.insert', 'pool_cars.update']))
    state.calls = []
    expect(await statusOf(cars.POST(json('POST', { name: 'Bus' })))).toBe(400)
    expect(state.calls).toEqual([])
  })
})

describe('unieke wagennaam en het planningsvenster', () => {
  it('dezelfde naam als een actieve wagen: 409 met een duidelijke melding', async () => {
    state.user = user(MANAGER)
    state.tables.pool_cars = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pool_cars_name_active_key"' } }
    expect(await answer(cars.POST(json('POST', newCar)))).toEqual({ status: 409, text: 'Er bestaat al een wagen met deze naam.' })
    expect(await answer(car.PATCH(json('PATCH', { name: 'Bus' }), params()))).toEqual({ status: 409, text: 'Er bestaat al een wagen met deze naam.' })
    state.tables.pool_cars = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pool_cars_license_plate_key"' } }
    expect(await answer(cars.POST(json('POST', newCar)))).toEqual({ status: 409, text: 'Er bestaat al een wagen met deze nummerplaat.' })
  })

  it('planning: from–to werkt, een te groot venster is een 400 zonder databaseverzoek', async () => {
    state.user = user(USER)
    expect(await statusOf(planning.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/planning?from=2026-11-02&to=2026-11-08')))).toBe(200)
    state.calls = []
    expect(await statusOf(planning.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/planning?from=2026-01-01&to=2026-12-31')))).toBe(400)
    expect(state.calls).toEqual([])
  })

  it('reserveren voor een collega geeft p_user_id door', async () => {
    state.user = user(USER)
    state.rpc.pool_create_reservation = { data: 'r1' }
    const U = '33333333-3333-4333-8333-333333333333'
    expect(await statusOf(reservations.POST(json('POST', { ...booking, user_id: U })))).toBe(201)
    expect(state.rpcArgs.pool_create_reservation).toMatchObject({ p_user_id: U })
  })
})

describe('schadestatus, blokkade en instellingen — alleen beheer', () => {
  it('een gewone gebruiker krijgt overal een 403, zonder databaseverzoek', async () => {
    state.user = user(USER)
    expect(await statusOf(damageStatus.PATCH(json('PATCH', { status: 'hersteld' }), params()))).toBe(403)
    expect(await statusOf(liftBlock.POST(json('POST'), params()))).toBe(403)
    expect(await statusOf(settings.GET())).toBe(403)
    expect(await statusOf(settings.PUT(json('PUT', { recipients: 'a@example.com' })))).toBe(403)
    expect(await statusOf(mailTest.POST())).toBe(403)
    expect(state.calls).toEqual([])
  })

  it('beheer: status wijzigen gaat via de databasefunctie', async () => {
    state.user = user(MANAGER)
    expect(await statusOf(damageStatus.PATCH(json('PATCH', { status: 'hersteld' }), params('d1')))).toBe(204)
    expect(state.rpcArgs.pool_set_damage_status).toEqual({ p_id: 'd1', p_status: 'hersteld' })
    expect(await statusOf(damageStatus.PATCH(json('PATCH', { status: 'weg' }), params('d1')))).toBe(400)
  })

  it('beheer: ongeldige ontvanger wordt geweigerd vóór de database', async () => {
    state.user = user(MANAGER)
    const r = await answer(settings.PUT(json('PUT', { recipients: 'goed@example.com, slecht' })))
    expect(r).toEqual({ status: 400, text: 'Geen geldig e-mailadres: slecht' })
    expect(state.calls).toEqual([])
  })
})

describe('reserveren', () => {
  it('gaat naar pool_create_reservation met tijdstippen in UTC, zonder klant', async () => {
    state.user = user(USER)
    state.rpc.pool_create_reservation = { data: 'r1' }
    expect(await statusOf(reservations.POST(json('POST', booking)))).toBe(201)
    expect(state.rpcArgs.pool_create_reservation).toEqual({
      p_car_id: CAR, p_start_at: '2026-12-01T07:00:00.000Z', p_end_at: '2026-12-01T16:00:00.000Z', p_client_id: null, p_client_name: null, p_note: null,
    })
  })

  it('met een bestaande of een getypte klant', async () => {
    state.user = user(USER)
    expect(await statusOf(reservations.POST(json('POST', { ...booking, client_id: CLIENT })))).toBe(201)
    expect(state.rpcArgs.pool_create_reservation).toMatchObject({ p_client_id: CLIENT, p_client_name: null })
    expect(await statusOf(now.POST(json('POST', { car_id: CAR, end: '2099-01-01T10:00', client_name: 'Club X' })))).toBe(201)
    expect(state.rpcArgs.pool_depart_now).toMatchObject({ p_client_id: null, p_client_name: 'Club X' })
  })

  it('een ongeldige klant: 400 vóór de database', async () => {
    state.user = user(USER)
    expect(await answer(reservations.POST(json('POST', { ...booking, client_id: 'x' })))).toEqual({ status: 400, text: 'Ongeldige klant.' })
    expect(state.calls).toEqual([])
  })

  it('overlap: 409 met de melding van de database', async () => {
    state.user = user(USER)
    state.rpc.pool_create_reservation = { error: { code: '23P01', message: 'Deze wagen is dan al gereserveerd: 01/12 09:00–01/12 12:00, Bram' } }
    expect(await answer(reservations.POST(json('POST', booking))))
      .toEqual({ status: 409, text: 'Deze wagen is dan al gereserveerd: 01/12 09:00–01/12 12:00, Bram' })
  })

  it('overlap die pas de constraint vangt (twee klikken tegelijk): ook een leesbare 409', async () => {
    state.user = user(USER)
    state.rpc.pool_create_reservation = { error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "pool_car_reservations_no_overlap"' } }
    expect(await answer(reservations.POST(json('POST', booking))))
      .toEqual({ status: 409, text: 'Deze wagen is in die periode al gereserveerd.' })
  })

  it('geblokkeerde wagen: 400 met de reden', async () => {
    state.user = user(USER)
    state.rpc.pool_depart_now = { error: { code: '23514', message: 'Bus is geblokkeerd door ernstige schade en kan niet gereserveerd worden.' } }
    expect(await answer(now.POST(json('POST', { car_id: CAR, end: '2099-01-01T10:00' }))))
      .toEqual({ status: 400, text: 'Bus is geblokkeerd door ernstige schade en kan niet gereserveerd worden.' })
  })

  it('andermans reservatie annuleren: 403 van de database komt door', async () => {
    state.user = user(USER)
    state.rpc.pool_cancel_reservation = { error: { code: '42501', message: 'Je kan alleen je eigen reservaties wijzigen.' } }
    expect(await answer(reservation.DELETE(json('DELETE'), params())))
      .toEqual({ status: 403, text: 'Je kan alleen je eigen reservaties wijzigen.' })
  })
})

describe('aankomst — km-validatie', () => {
  it('zonder km: 400 vóór de database', async () => {
    state.user = user(USER)
    expect(await answer(arrival.POST(json('POST', {}), params()))).toEqual({ status: 400, text: 'Vul de kilometerstand bij aankomst in.' })
    expect(state.calls).toEqual([])
  })

  it('lager dan bij vertrek: 400 met de melding van de database', async () => {
    state.user = user(USER)
    state.rpc.pool_register_arrival = { error: { code: '22023', message: 'De kilometerstand bij aankomst (900) moet minstens die bij vertrek (1000) zijn.' } }
    expect(await answer(arrival.POST(json('POST', { km: 900 }), params())))
      .toEqual({ status: 400, text: 'De kilometerstand bij aankomst (900) moet minstens die bij vertrek (1000) zijn.' })
  })
})

describe('schademail — blokkeert de melding nooit', () => {
  const report = (extra: Record<string, unknown> = {}) => ({
    data: {
      id: 'd1', car_id: CAR, description: 'deuk', severity: 'ernstig', reported_by: 'u1', reported_by_name: 'Anna',
      mail_attempted_at: null, pool_cars: { name: 'Bus', license_plate: '1-ABC-234' }, pool_car_damage_photos: [{ id: 'p1' }], ...extra,
    },
  })
  const ENV = ['POOLWAGENS_MAIL_WORKER_URL', 'POOLWAGENS_MAIL_WORKER_SECRET'] as const
  afterEach(() => { for (const k of ENV) delete process.env[k] })

  it('zonder mail-env-vars: 200, en de status "niet geconfigureerd" wordt opgeslagen', async () => {
    state.user = user(USER)
    state.tables.pool_car_damage_reports = report()
    state.tables.pool_settings = { data: { damage_mail_recipients: ['vloot@example.com'] } }
    expect(await answer(notify.POST(json('POST'), params('d1')))).toEqual({ status: 200, text: JSON.stringify({ mail_status: 'niet_geconfigureerd' }) })
    expect(state.rpcArgs.pool_set_damage_mail_status).toEqual({ p_id: 'd1', p_status: 'niet_geconfigureerd', p_error: null })
  })

  it('de mail-worker weigert: 200, status "mislukt" met de fout, niets gegooid', async () => {
    process.env.POOLWAGENS_MAIL_WORKER_URL = 'https://script.google.com/macros/s/test/exec'
    process.env.POOLWAGENS_MAIL_WORKER_SECRET = 'g'.repeat(40)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.user = user(USER)
    state.tables.pool_car_damage_reports = report()
    state.tables.pool_settings = { data: { damage_mail_recipients: ['vloot@example.com'] } }
    expect(await answer(notify.POST(json('POST'), params('d1')))).toEqual({ status: 200, text: JSON.stringify({ mail_status: 'mislukt' }) })
    expect(state.rpcArgs.pool_set_damage_mail_status).toEqual({ p_id: 'd1', p_status: 'mislukt', p_error: 'Geen toegang.' })
    spy.mockRestore()
  })

  it('geen ontvangers ingesteld: status "geen ontvangers"', async () => {
    process.env.POOLWAGENS_MAIL_WORKER_URL = 'https://script.google.com/macros/s/test/exec'
    process.env.POOLWAGENS_MAIL_WORKER_SECRET = 'g'.repeat(40)
    state.user = user(USER)
    state.tables.pool_car_damage_reports = report()
    state.tables.pool_settings = { data: { damage_mail_recipients: [] } }
    expect(await answer(notify.POST(json('POST'), params('d1')))).toEqual({ status: 200, text: JSON.stringify({ mail_status: 'geen_ontvangers' }) })
  })

  it('wie meldde, kan de mail niet twee keer laten versturen; iemand anders al helemaal niet', async () => {
    state.user = user(USER)
    state.tables.pool_car_damage_reports = report({ mail_attempted_at: '2026-11-04T10:00:00Z' })
    expect(await statusOf(notify.POST(json('POST'), params('d1')))).toBe(409)
    state.tables.pool_car_damage_reports = report({ reported_by: 'iemand-anders' })
    expect(await statusOf(notify.POST(json('POST'), params('d1')))).toBe(409)
    expect(state.calls).not.toContain('rpc:pool_set_damage_mail_status')
  })
})

describe('historiek — klantfilter', () => {
  it('zoekt op de getypte naam en op gekoppelde klanten, zonder dat de zoekterm een filter wordt', async () => {
    state.user = user(USER)
    state.tables.clients = { data: [{ id: CLIENT }] }
    expect(await statusOf(history.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/history?klant=Croky),x.eq.(1')))).toBe(200)
    expect(state.calls).toContain(`pool_car_reservations.or:client_name.ilike.*Croky x.eq. 1*,client_id.in.(${CLIENT})`)
  })

  it('zonder gekoppelde klant: alleen op de naam', async () => {
    state.user = user(USER)
    state.tables.clients = { data: [] }
    expect(await statusOf(history.GET(json('GET', undefined, 'http://hub.test/api/poolwagens/history?klant=Club')))).toBe(200)
    expect(state.calls).toContain('pool_car_reservations.or:client_name.ilike.*Club*')
  })
})

describe('tankkaart en pincode (0087)', () => {
  it('een gewone gebruiker kan de kaart niet instellen en het overzicht niet zien, zonder databaseverzoek', async () => {
    state.user = user(USER)
    expect(await statusOf(fuelCards.GET())).toBe(403)
    expect(await statusOf(fuelCard.PUT(json('PUT', { card_number: '7077 1234', pin: '1234' }), params()))).toBe(403)
    expect(state.calls).toEqual([])
  })

  it('beheer: ongeldige pincode is een 400 zonder databaseverzoek; geldige gaat naar de databasefunctie', async () => {
    state.user = user(MANAGER)
    expect(await answer(fuelCard.PUT(json('PUT', { card_number: '7077 1234', pin: '12a4' }), params()))).toEqual({ status: 400, text: 'De pincode bestaat uit 4 tot 8 cijfers.' })
    expect(state.calls).toEqual([])

    state.tables.pool_cars = { data: { id: 'id-1', fuel_card_last4: '1234' } }
    const res = (await fuelCard.PUT(json('PUT', { card_number: '7077 1234', pin: '4321' }), params()))!
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.text()).not.toContain('4321')
    expect(state.rpcArgs.pool_set_fuel_card).toEqual({ p_car_id: 'id-1', p_card_number: '7077 1234', p_pin: '4321', p_clear_pin: false })
  })

  it('de pincode: wat de database toelaat, nooit gecachet', async () => {
    state.user = user(USER)
    state.rpc.pool_fuel_card_pin = { data: '1234' }
    const res = (await pin.POST(json('POST'), params('car-1')))!
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.json()).toEqual({ pin: '1234' })
    expect(state.rpcArgs.pool_fuel_card_pin).toEqual({ p_car_id: 'car-1' })
  })

  it('de pincode: geen rit, dan de melding van de database als 403', async () => {
    state.user = user(USER)
    state.rpc.pool_fuel_card_pin = { data: null, error: { code: '42501', message: 'De pincode zie je alleen tijdens je eigen rit met deze wagen.' } }
    expect(await answer(pin.POST(json('POST'), params()))).toEqual({ status: 403, text: 'De pincode zie je alleen tijdens je eigen rit met deze wagen.' })
  })

  it('de pincode: zonder rechten op Poolwagens niets', async () => {
    state.user = user([])
    expect(await statusOf(pin.POST(json('POST'), params()))).toBe(403)
    expect(state.calls).toEqual([])
  })
})
