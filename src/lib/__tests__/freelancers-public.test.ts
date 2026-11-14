import { describe, it, expect, vi, beforeEach } from 'vitest'

// De persoonlijke link (/api/public/f/*), Fase 4 van docs/freelancers-redesign.md.
// Met een kleine in-memory database die filters ECHT toepast en volledige
// rijen teruggeeft — inclusief velden die nooit naar buiten mogen. Lekt een
// route zo'n veld, dan ziet deze test het.
//   - fout token, ingetrokken link en gearchiveerde freelancer: hetzelfde antwoord
//   - 5× een foute pincode blokkeert de link
//   - een opdracht of bestand van een andere freelancer: 404
//   - concepten en geannuleerde opdrachten zijn niet zichtbaar
//   - geen publiek antwoord bevat notes, overall_rating(_note), reviewvelden of interne events

process.env.FREELANCER_LINK_SECRET = 'test-geheim-dat-zeker-lang-genoeg-is-0123456789'

type Row = Record<string, unknown>
const db: { tables: Record<string, Row[]>; rpcCalls: string[]; drive: string[]; push: unknown[] } = { tables: {}, rpcCalls: [], drive: [], push: [] }

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  const rows = () => (db.tables[table] ??= [])
  const matched = () => rows().filter(r => filters.every(f => f(r)))
  const run = () => {
    if (op === 'insert') { const list = Array.isArray(payload) ? payload : [payload!]; list.forEach(r => rows().push({ id: `id-${rows().length + 1}`, ...r })); return list }
    if (op === 'update') { const m = matched(); m.forEach(r => Object.assign(r, payload)); return m }
    if (op === 'delete') { const m = matched(); db.tables[table] = rows().filter(r => !m.includes(r)); return m }
    return matched()
  }
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, limit: () => q,
    insert: (p: Row) => { op = 'insert'; payload = p; return q },
    update: (p: Row) => { op = 'update'; payload = p; return q },
    delete: () => { op = 'delete'; return q },
    eq: (c: string, v: unknown) => { filters.push(r => String(r[c]) === String(v)); return q },
    in: (c: string, v: unknown[]) => { filters.push(r => v.map(String).includes(String(r[c]))); return q },
    is: (c: string, v: null) => { filters.push(r => (r[c] ?? null) === v); return q },
    not: (c: string, _op: string, v: null) => { filters.push(r => (r[c] ?? null) !== v); return q },
    lt: (c: string, v: string) => { filters.push(r => String(r[c]) < v); return q },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: (v: unknown) => void) => res({ data: run(), error: null, count: matched().length }),
  }
  return q
}

const fakeDb = {
  from: (t: string) => query(t),
  rpc: async (name: string, args: Record<string, unknown>) => {
    db.rpcCalls.push(name)
    if (name === 'public_rate_hit') return { data: true, error: null }
    const link = db.tables.freelancer_links.find(l => l.id === args.p_link_id)!
    if (name === 'freelancer_link_pin_ok') { link.failed_pin_attempts = 0; link.last_opened_at = new Date().toISOString(); return { data: null, error: null } }
    if (name === 'freelancer_link_pin_failed') {
      link.failed_pin_attempts = (link.failed_pin_attempts as number) + 1
      if ((link.failed_pin_attempts as number) >= (args.p_max as number)) {
        link.failed_pin_attempts = 0
        link.lockout_count = (link.lockout_count as number) + 1
        link.lockout_window_start ??= new Date().toISOString()
        link.locked_until = new Date(Date.now() + (args.p_lock_minutes as number) * 60_000).toISOString()
      }
      return { data: [{ failed: link.failed_pin_attempts, locked_until: link.locked_until, lockout_count: link.lockout_count, needs_new_pin: (link.lockout_count as number) >= (args.p_hard as number) }], error: null }
    }
    return { data: null, error: null }
  },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'sara@sporthouse.example', user_metadata: { full_name: 'Sara Peeters' } } } }) } },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://supa.example/signed' } }) }) },
}

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => fakeDb, createClient: async () => fakeDb }))
vi.mock('next/server', async orig => ({ ...(await orig<object>()), after: () => {} }))
vi.mock('@/lib/poolwagens/push', () => ({ pushToUsers: async (ids: string[], p: unknown) => { db.push.push({ ids, p }); return 1 } }))
vi.mock('@/lib/drive-storage', () => ({
  createResumableUploadSession: async (n: string) => { db.drive.push(`session:${n}`); return 'https://www.googleapis.com/upload/drive/v3/files?upload_id=1' },
  getResumableUploadResult: async () => ({ done: true, fileId: 'drive-9' }),
  getOrCreateFolderPath: async () => 'map-ok', driveRootFolderId: () => 'root', trashFile: async () => {},
}))
vi.mock('@/features/freelancers/lib/drive-files', () => ({
  getMetaNoShare: async () => ({ id: 'drive-9', name: 'eindversie.mp4', mimeType: 'video/mp4', size: 42, parents: ['map-ok'], webViewLink: null }),
  shareFilePublicly: async (id: string) => { db.drive.push(`share:${id}`); return 'perm-1' },
  revokePermission: async () => {}, listAnyonePermissions: async () => [],
  publicDownloadUrl: (id: string) => `https://drive.usercontent.google.com/download?id=${id}`,
}))

const { newToken, hashToken, toPgBytea, hashPin } = await import('@/features/freelancers/lib/link-crypto')
const { signSession, COOKIE_NAME } = await import('@/features/freelancers/lib/link-session')
type Fx<T> = { [K in keyof T]: T[K] extends (...a: infer A) => Promise<unknown> ? (...a: A) => Promise<Response> : T[K] }
const fx = <T,>(m: T) => m as unknown as Fx<T>
const session = fx(await import('@/app/api/public/f/session/route'))
const pin = fx(await import('@/app/api/public/f/pin/route'))
const me = fx(await import('@/app/api/public/f/me/route'))
const availability = fx(await import('@/app/api/public/f/availability/route'))
const detail = fx(await import('@/app/api/public/f/assignments/[id]/route'))
const action = fx(await import('@/app/api/public/f/assignments/[id]/action/route'))
const uploadSession = fx(await import('@/app/api/public/f/assignments/[id]/upload-session/route'))
const finalize = fx(await import('@/app/api/public/f/assignments/[id]/finalize/route'))
const file = fx(await import('@/app/api/public/f/files/[fileId]/route'))

const F1 = '11111111-1111-4111-8111-111111111111', F2 = '22222222-2222-4222-8222-222222222222'
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const A = { mine: 'a1111111-1111-4111-8111-111111111111', concept: 'a2222222-2222-4222-8222-222222222222', cancelled: 'a3333333-3333-4333-8333-333333333333', oldDone: 'a4444444-4444-4444-8444-444444444444', other: 'a5555555-5555-4555-8555-555555555555', accepted: 'a6666666-6666-4666-8666-666666666666' }
const FILES = { mine: 'f1111111-1111-4111-8111-111111111111', other: 'f2222222-2222-4222-8222-222222222222' }
const PIN = '0427'
let token1 = '', token2 = '', pinHash = ''

const SECRET_FIELDS = { notes: 'GEHEIME NOTITIE', overall_rating: 2, overall_rating_note: 'GEHEIME BEOORDELING', status: 'kandidaat', email: 'freelancer@example.com', rate_note: 'GEHEIM TARIEF' }
const assignment = (id: string, freelancer_id: string, status: string, extra: Row = {}) => ({
  id, freelancer_id, status, title: `Opdracht ${id.slice(0, 2)}`, briefing: 'Regel 1\n\nRegel 2', deadline: '2026-12-01',
  client_name: null, client: { name: 'KRC Genk', contact_email: 'GEHEIM@klant.example' }, agreed_amount: 4321.5,
  status_changed_at: new Date().toISOString(), first_viewed_at: null, is_historical: false,
  created_by: 'staff-1', created_by_email: 'sara@sporthouse.example', discipline: 'video', shared_at: null, ...extra,
})

beforeEach(async () => {
  token1 = newToken(); token2 = newToken(); pinHash ||= await hashPin(PIN)
  db.rpcCalls = []; db.drive = []; db.push = []
  db.tables = {
    freelancers: [
      { id: F1, name: 'Jan Janssens', archived_at: null, availability: 'beschikbaar', available_from: null, ...SECRET_FIELDS },
      { id: F2, name: 'Piet Andere', archived_at: null, availability: 'beschikbaar', available_from: null, ...SECRET_FIELDS },
    ],
    freelancer_links: [
      { id: L1, freelancer_id: F1, token_hash: toPgBytea(hashToken(token1)), pin_hash: pinHash, revoked_at: null, failed_pin_attempts: 0, locked_until: null, lockout_count: 0, lockout_window_start: null },
      { id: L2, freelancer_id: F2, token_hash: toPgBytea(hashToken(token2)), pin_hash: pinHash, revoked_at: null, failed_pin_attempts: 0, locked_until: null, lockout_count: 0, lockout_window_start: null },
    ],
    freelancer_assignments: [
      assignment(A.mine, F1, 'gedeeld'),
      assignment(A.accepted, F1, 'geaccepteerd'),
      assignment(A.concept, F1, 'concept'),
      assignment(A.cancelled, F1, 'geannuleerd'),
      assignment(A.oldDone, F1, 'afgerond', { status_changed_at: new Date(Date.now() - 40 * 86400_000).toISOString() }),
      assignment(A.other, F2, 'gedeeld'),
    ],
    freelancer_assignment_files: [
      { id: FILES.mine, assignment_id: A.mine, file_name: 'brief.pdf', file_size: 10, file_type: 'application/pdf', kind: 'briefing', uploaded_by: 'team', uploaded_at: '2026-11-01', storage_provider: 'drive', drive_file_id: 'drive-1', file_url: null, web_view_link: 'https://drive/intern', public_shared_at: null, public_permission_id: null, created_by: 'staff-1' },
      { id: FILES.other, assignment_id: A.other, file_name: 'ander.pdf', file_size: 10, file_type: 'application/pdf', kind: 'briefing', uploaded_by: 'team', uploaded_at: '2026-11-01', storage_provider: 'drive', drive_file_id: 'drive-2', file_url: null, web_view_link: null, public_shared_at: null, public_permission_id: null, created_by: 'staff-1' },
    ],
    freelancer_assignment_events: [
      { id: 'e1', assignment_id: A.accepted, actor_type: 'team', actor_id: 'staff-1', from_status: 'opgeleverd', to_status: 'geaccepteerd', message: 'Logo iets groter aub', visible_to_freelancer: true, created_at: '2026-11-02' },
      { id: 'e2', assignment_id: A.accepted, actor_type: 'team', actor_id: 'staff-1', kind: 'notitie', from_status: null, to_status: null, message: 'INTERN: niet meer boeken', visible_to_freelancer: false, created_at: '2026-11-03' },
    ],
    freelancer_reviews: [{ id: 'r1', assignment_id: A.oldDone, score: 1, comment: 'GEHEIME REVIEW', reviewer_id: 'staff-1' }],
  }
})

const H = { origin: 'https://hub.example', 'content-type': 'application/json' }
const post = (url: string, body: unknown, cookie?: string) =>
  new Request(`https://hub.example${url}`, { method: 'POST', headers: { ...H, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
const put = (url: string, body: unknown, cookie: string) =>
  new Request(`https://hub.example${url}`, { method: 'PUT', headers: { ...H, cookie }, body: JSON.stringify(body) })
const get = (url: string, cookie?: string) => new Request(`https://hub.example${url}`, { headers: cookie ? { cookie } : {} })
const cookieFor = (linkId: string) => `${COOKIE_NAME}=${signSession(linkId, pinHash)}`
const p = (id: string) => ({ params: Promise.resolve({ id }) })
const pf = (fileId: string) => ({ params: Promise.resolve({ fileId }) })
const snapshot = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers.entries()].filter(([k]) => k !== 'date').sort() })

describe('ongeldige links: altijd hetzelfde antwoord', () => {
  it('fout token, ingetrokken link en gearchiveerde freelancer zijn niet van elkaar te onderscheiden', async () => {
    const unknown = await snapshot(await session.POST(post('/api/public/f/session', { token: newToken() })))
    db.tables.freelancer_links[0].revoked_at = '2026-11-01'
    const revoked = await snapshot(await session.POST(post('/api/public/f/session', { token: token1 })))
    db.tables.freelancer_links[0].revoked_at = null
    db.tables.freelancers[0].archived_at = '2026-11-01'
    const archived = await snapshot(await session.POST(post('/api/public/f/session', { token: token1 })))
    const malformed = await snapshot(await session.POST(post('/api/public/f/session', { token: 'kort' })))
    expect(unknown).toEqual({ status: 404, body: '{"state":"ongeldig"}', headers: expect.any(Array) })
    expect(revoked).toEqual(unknown)
    expect(archived).toEqual(unknown)
    expect(malformed).toEqual(unknown)
  })

  it('ook de pincoderoute zegt hetzelfde, en raakt dan geen teller aan', async () => {
    db.tables.freelancers[0].archived_at = '2026-11-01'
    const a = await snapshot(await pin.POST(post('/api/public/f/pin', { token: token1, pin: PIN })))
    const b = await snapshot(await pin.POST(post('/api/public/f/pin', { token: newToken(), pin: PIN })))
    expect(a).toEqual(b)
    expect(a.status).toBe(404)
    expect(db.rpcCalls.filter(n => n !== 'public_rate_hit')).toEqual([])
  })

  it('een geldig token zonder sessie vraagt de pincode', async () => {
    const res = await session.POST(post('/api/public/f/session', { token: token1 }))
    expect(await res.json()).toEqual({ state: 'pin', attemptsLeft: 5 })
  })
})

describe('pincode', () => {
  it('juist → cookie op alleen /f en /api/public/f, HttpOnly, Secure, SameSite=Strict; zonder pincode of token erin', async () => {
    const res = await pin.POST(post('/api/public/f/pin', { token: token1, pin: PIN }))
    expect(await res.json()).toEqual({ state: 'ok' })
    const cookies = res.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies.map(c => c.match(/Path=([^;]+)/)![1]).sort()).toEqual(['/api/public/f', '/f'])
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/); expect(c).toMatch(/Secure/); expect(c).toMatch(/SameSite=Strict/)
      expect(c).not.toContain(PIN); expect(c).not.toContain(token1)
      expect(c).toMatch(new RegExp(`^${COOKIE_NAME}=${L1}\\.\\d+\\.[A-Za-z0-9_-]{43};`))
    }
  })

  it('5× fout blokkeert de link; daarna helpt ook de juiste pincode niet', async () => {
    const left: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = await pin.POST(post('/api/public/f/pin', { token: token1, pin: '9999' }))
      expect(r.status).toBe(401)
      left.push((await r.json()).attemptsLeft)
    }
    expect(left).toEqual([4, 3, 2, 1])
    const fifth = await pin.POST(post('/api/public/f/pin', { token: token1, pin: '9999' }))
    expect(fifth.status).toBe(423)
    expect(await fifth.json()).toMatchObject({ state: 'geblokkeerd', needsNewPin: false, until: expect.any(String) })
    const right = await pin.POST(post('/api/public/f/pin', { token: token1, pin: PIN }))
    expect(right.status).toBe(423)
    expect(right.headers.getSetCookie()).toEqual([])
    expect(await (await session.POST(post('/api/public/f/session', { token: token1 }))).json()).toMatchObject({ state: 'geblokkeerd' })
  })

  it('verzoeken zonder eigen Origin worden geweigerd (CSRF)', async () => {
    const req = new Request('https://hub.example/api/public/f/pin', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ token: token1, pin: PIN }) })
    expect((await pin.POST(req)).status).toBe(403)
  })

  it('een nieuwe pincode maakt bestaande sessies ongeldig', async () => {
    const c = cookieFor(L1)
    expect((await me.GET(get('/api/public/f/me', c))).status).toBe(200)
    db.tables.freelancer_links[0].pin_hash = await hashPin('1111')
    expect((await me.GET(get('/api/public/f/me', c))).status).toBe(401)
  })
})

describe('wat de freelancer ziet', () => {
  it('geen concept, geen geannuleerde, geen oude afgeronde, geen opdracht van een ander', async () => {
    const body = await (await me.GET(get('/api/public/f/me', cookieFor(L1)))).json()
    expect(body.firstName).toBe('Jan')
    expect(body.assignments.map((a: Row) => a.id).sort()).toEqual([A.mine, A.accepted].sort())
    expect(body.assignments.find((a: Row) => a.id === A.accepted).feedback).toBe(true)
    expect(body.assignments.find((a: Row) => a.id === A.mine).isNew).toBe(true)
  })

  for (const [name, id] of [['concept', A.concept], ['geannuleerd', A.cancelled], ['afgerond > 30 dagen', A.oldDone], ['van een andere freelancer', A.other]]) {
    it(`detail, actie en uploads: ${name} → 404`, async () => {
      const c = cookieFor(L1)
      expect((await detail.GET(get(`/api/public/f/assignments/${id}`, c), p(id))).status).toBe(404)
      expect((await action.POST(post(`/api/public/f/assignments/${id}/action`, { action: 'accepteren' }, c), p(id))).status).toBe(404)
      expect((await uploadSession.POST(post(`/api/public/f/assignments/${id}/upload-session`, { files: [{ name: 'a.mp4', size: 1 }] }, c), p(id))).status).toBe(404)
    })
  }

  it('een bestand van een andere freelancer → 404, zonder deling', async () => {
    expect((await file.GET(get(`/api/public/f/files/${FILES.other}`, cookieFor(L1)), pf(FILES.other))).status).toBe(404)
    expect(db.drive).toEqual([])
  })

  it('een eigen bestand: pas na de controles gedeeld, dan 302 naar Drive', async () => {
    const res = await file.GET(get(`/api/public/f/files/${FILES.mine}`, cookieFor(L1)), pf(FILES.mine))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('drive.usercontent.google.com')
    expect(db.drive).toEqual(['share:drive-1'])
  })

  it('de eerste keer openen zet first_viewed_at en schrijft één event', async () => {
    const c = cookieFor(L1)
    await detail.GET(get(`/api/public/f/assignments/${A.mine}`, c), p(A.mine))
    await detail.GET(get(`/api/public/f/assignments/${A.mine}`, c), p(A.mine))
    expect(db.tables.freelancer_assignments.find(a => a.id === A.mine)!.first_viewed_at).toBeTruthy()
    expect(db.tables.freelancer_assignment_events.filter(e => e.kind === 'bekeken')).toHaveLength(1)
  })

  it('accepteren gaat via de overgangsfunctie, schrijft een event en meldt de maker', async () => {
    const res = await action.POST(post(`/api/public/f/assignments/${A.mine}/action`, { action: 'accepteren' }, cookieFor(L1)), p(A.mine))
    expect(res.status).toBe(200)
    expect(db.tables.freelancer_assignments.find(a => a.id === A.mine)!.status).toBe('geaccepteerd')
    expect(db.tables.freelancer_assignment_events.at(-1)).toMatchObject({ actor_type: 'freelancer', actor_id: null, to_status: 'geaccepteerd' })
    expect(db.push).toHaveLength(1)
    // opleveren mag pas na accepteren; afronden nooit
    expect((await action.POST(post(`/api/public/f/assignments/${A.other}/action`, { action: 'opleveren' }, cookieFor(L2)), p(A.other))).status).toBe(409)
    expect((await action.POST(post(`/api/public/f/assignments/${A.mine}/action`, { action: 'afronden' }, cookieFor(L1)), p(A.mine))).status).toBe(400)
  })

  it('beschikbaarheid zetten bewaart de bron "freelancer"', async () => {
    await availability.PUT(put('/api/public/f/availability', { availability: 'beperkt', available_from: '2026-12-01' }, cookieFor(L1)))
    expect(db.tables.freelancers[0]).toMatchObject({ availability: 'beperkt', available_from: '2026-12-01', availability_updated_by: 'freelancer' })
    expect(db.tables.freelancers[1].availability).toBe('beschikbaar')
  })

  it('opleveren: alleen bij een geaccepteerde opdracht, als oplevering geregistreerd', async () => {
    const c = cookieFor(L1)
    expect((await uploadSession.POST(post(`/api/public/f/assignments/${A.mine}/upload-session`, { files: [{ name: 'a.mp4', size: 1 }] }, c), p(A.mine))).status).toBe(409)
    expect((await uploadSession.POST(post(`/api/public/f/assignments/${A.accepted}/upload-session`, { files: [{ name: 'script.js', size: 1 }] }, c), p(A.accepted))).status).toBe(400)
    const ok = await finalize.POST(post(`/api/public/f/assignments/${A.accepted}/finalize`, { uploads: [{ uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=1', size: 42 }] }, c), p(A.accepted))
    expect((await ok.json()).results[0].ok).toBe(true)
    expect(db.tables.freelancer_assignment_files.at(-1)).toMatchObject({ kind: 'oplevering', uploaded_by: 'freelancer', created_by: null })
  })
})

describe('geen interne gegevens in publieke antwoorden', () => {
  const FORBIDDEN_KEYS = ['notes', 'overall_rating', 'overall_rating_note', 'score', 'score_quality', 'score_deadline', 'score_communication',
    'comment', 'reviewer_id', 'review', 'visible_to_freelancer', 'actor_id', 'actor_type', 'created_by', 'created_by_email', 'pin_hash',
    'token_hash', 'token_encrypted', 'freelancer_id', 'web_view_link', 'drive_file_id', 'rate_note', 'contact_email', 'is_historical', 'discipline',
    // Bedragen horen in offertes en facturen, nooit op de link.
    'agreed_amount', 'agreedAmount', 'amount', 'rate_amount', 'rate_unit']
  const FORBIDDEN_VALUES = ['GEHEIME NOTITIE', 'GEHEIME BEOORDELING', 'GEHEIME REVIEW', 'INTERN: niet meer boeken', 'kandidaat', 'GEHEIM TARIEF', 'GEHEIM@klant', 'freelancer@example.com', 'https://drive/intern', '4321', '€']

  function keysOf(v: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(v)) v.forEach(x => keysOf(x, out))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out) }
    return out
  }

  it('op veldnaam en op inhoud, voor elke publieke route', async () => {
    const c = cookieFor(L1)
    const responses = [
      await session.POST(post('/api/public/f/session', { token: token1 }, c)),
      await me.GET(get('/api/public/f/me', c)),
      await detail.GET(get(`/api/public/f/assignments/${A.mine}`, c), p(A.mine)),
      await detail.GET(get(`/api/public/f/assignments/${A.accepted}`, c), p(A.accepted)),
      await availability.PUT(put('/api/public/f/availability', { availability: 'beschikbaar' }, c)),
      await action.POST(post(`/api/public/f/assignments/${A.mine}/action`, { action: 'weigeren', reason: 'op reis' }, c), p(A.mine)),
      await uploadSession.POST(post(`/api/public/f/assignments/${A.accepted}/upload-session`, { files: [{ name: 'a.mp4', size: 1 }] }, c), p(A.accepted)),
      await pin.POST(post('/api/public/f/pin', { token: token1, pin: '9999' })),
    ]
    for (const res of responses) {
      const text = await res.text()
      const keys = keysOf(JSON.parse(text))
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${res.url} → ${k}`).toBe(false)
      for (const v of FORBIDDEN_VALUES) expect(text, v).not.toContain(v)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })

  it('de feedback van het team is wel zichtbaar, de interne notitie niet', async () => {
    const body = await (await detail.GET(get(`/api/public/f/assignments/${A.accepted}`, cookieFor(L1)), p(A.accepted))).json()
    expect(body.messages).toEqual([{ message: 'Logo iets groter aub', at: '2026-11-02', kind: 'feedback' }])
    expect(body.contact).toEqual({ name: 'Sara Peeters', email: 'sara@sporthouse.example' })
  })

  it('zonder geldige cookie geeft elke route achter de pincode 401', async () => {
    const forged = `${COOKIE_NAME}=${L1}.9999999999.${'A'.repeat(43)}`
    for (const cookie of [undefined, forged, cookieFor(L2).replace(L2, L1)]) {
      expect((await me.GET(get('/api/public/f/me', cookie))).status).toBe(401)
      expect((await detail.GET(get(`/api/public/f/assignments/${A.mine}`, cookie), p(A.mine))).status).toBe(401)
      expect((await file.GET(get(`/api/public/f/files/${FILES.mine}`, cookie), pf(FILES.mine))).status).toBe(401)
    }
  })
})
