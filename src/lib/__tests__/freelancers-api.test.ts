import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// De interne freelancer-API van Fase 3 (docs/freelancers-redesign.md), met een
// nagemaakte Supabase en Drive. Wat hier getest wordt:
//   - rechten: geen / geen permissions-object / bekijken / beheren, per route
//   - statusovergangen via de route: toegelaten, geweigerd, gelijktijdig
//   - delen maakt zo nodig een link, en de pincode komt precies één keer terug
//   - de linkstatus toont nooit token of pincode; in de database alleen hashes
//   - downloads: altijd een redirect, nooit bytes door onze function
//   - uploads: Drive wordt nagevraagd, de browser niet geloofd
//   - reviews alleen op afgeronde opdrachten; overall_rating alleen via /rating
//   - de cron vraagt het geheim; de match filtert hard vóór het model

type FakeUser = { id: string; email?: string; app_metadata: Record<string, unknown> } | null
type Result = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number }
interface Call { table: string; op: string; payload?: unknown; filters: string[] }
type Handler = (c: Call) => Result | undefined

const state: {
  user: FakeUser; calls: Call[]; handler: Handler; storage: string[]; drive: string[]
  after: (() => unknown)[]; auth: string | null; claude: unknown[]
} = { user: null, calls: [], handler: () => undefined, storage: [], drive: [], after: [], auth: null, claude: [] }

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  const q: Record<string, unknown> = {}
  q.select = () => q
  for (const op of ['insert', 'update', 'delete', 'upsert']) q[op] = (payload?: unknown) => { call.op = op; call.payload = payload; return q }
  for (const f of ['eq', 'neq', 'is', 'not', 'in', 'lt', 'gt', 'order', 'limit']) {
    q[f] = (...args: unknown[]) => { call.filters.push(`${f}:${args.slice(0, 2).map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join('=')}`); return q }
  }
  const exec = () => { state.calls.push(call); return state.handler(call) ?? { data: null, error: null } }
  q.single = async () => exec()
  q.maybeSingle = async () => exec()
  q.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej)
  return q
}
const client = () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: (t: string) => builder(t),
  storage: {
    from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: 'https://supa.example/signed?token=60s' } }),
      createSignedUploadUrl: async (p: string) => { state.storage.push(`signedUpload:${p}`); return { data: { token: 't', signedUrl: 'https://supa.example/up' }, error: null } },
      list: async () => ({ data: [] }),
      remove: async () => ({}),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://supa.example/${p}` } }),
    }),
  },
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client(), createAdminClient: () => client() }))
vi.mock('next/server', async orig => ({ ...(await orig<object>()), after: (fn: () => unknown) => { state.after.push(fn) } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(state.auth ? { authorization: state.auth } : {}) }))
vi.mock('@/lib/drive-storage', () => ({
  createResumableUploadSession: async (name: string) => { state.drive.push(`session:${name}`); return `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${name}` },
  getResumableUploadResult: async () => ({ done: true, fileId: 'drive-1' }),
  getOrCreateFolderPath: async (segs: string[]) => { state.drive.push(`folder:${segs.join('/')}`); return 'folder-ok' },
  driveRootFolderId: () => 'root',
  trashFile: async (id: string) => { state.drive.push(`trash:${id}`) },
  downloadFile: async () => { state.drive.push('STREAM'); throw new Error('mag niet') },
}))
const meta = { id: 'drive-1', name: 'logo.png', mimeType: 'image/png', size: 10, parents: ['folder-ok'], webViewLink: 'https://drive.google.com/file/d/drive-1/view' }
vi.mock('@/features/freelancers/lib/drive-files', () => ({
  getMetaNoShare: async () => ({ ...meta }),
  shareFilePublicly: async (id: string) => { state.drive.push(`share:${id}`); return 'perm-1' },
  revokePermission: async (id: string, p: string) => { state.drive.push(`revoke:${id}:${p}`) },
  listAnyonePermissions: async () => [],
  publicDownloadUrl: (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
}))
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  class RateLimitError extends APIError {}
  return { default: Object.assign(class { beta = { messages: { parse: async (p: unknown) => { state.claude.push(p); return { parsed_output: { matches: [] }, stop_reason: 'end_turn' } } } } }, { APIError, RateLimitError }) }
})

process.env.FREELANCER_LINK_SECRET = 'test-geheim-dat-zeker-lang-genoeg-is-0123456789'
process.env.CRON_SECRET = 'cron-geheim'

type R = (...a: never[]) => Promise<Response | undefined>
type Fixed<T> = { [K in keyof T]: T[K] extends (...a: infer A) => Promise<unknown> ? (...a: A) => Promise<Response> : T[K] }
const fixed = <T,>(m: T) => m as unknown as Fixed<T>
const list = fixed(await import('@/app/api/freelancers/route'))
const one = fixed(await import('@/app/api/freelancers/[id]/route'))
const archive = fixed(await import('@/app/api/freelancers/[id]/archive/route'))
const rating = fixed(await import('@/app/api/freelancers/[id]/rating/route'))
const link = fixed(await import('@/app/api/freelancers/[id]/link/route'))
const linkPin = fixed(await import('@/app/api/freelancers/[id]/link/pin/route'))
const linkUrl = fixed(await import('@/app/api/freelancers/[id]/link/url/route'))
const avatar = fixed(await import('@/app/api/freelancers/[id]/avatar/route'))
const assignments = fixed(await import('@/app/api/freelancers/assignments/route'))
const assignment = fixed(await import('@/app/api/freelancers/assignments/[id]/route'))
const transition = fixed(await import('@/app/api/freelancers/assignments/[id]/transition/route'))
const review = fixed(await import('@/app/api/freelancers/assignments/[id]/review/route'))
const session = fixed(await import('@/app/api/freelancers/assignments/[id]/files/upload-session/route'))
const finalize = fixed(await import('@/app/api/freelancers/assignments/[id]/files/finalize/route'))
const file = fixed(await import('@/app/api/freelancers/assignments/[id]/files/[fileId]/route'))
const disciplines = fixed(await import('@/app/api/freelancers/disciplines/route'))
const discipline = fixed(await import('@/app/api/freelancers/disciplines/[key]/route'))
const match = fixed(await import('@/app/api/freelancers/match/route'))
const cron = fixed(await import('@/app/api/cron/freelancer-shares/route'))
void ({} as R)

const F = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const FILE = '33333333-3333-4333-8333-333333333333'
const user = (sections: string[] | null): FakeUser => ({ id: 'u1', email: 'c@example.com', app_metadata: sections ? { permissions: { sections } } : {} })
const VIEW = ['freelancers_bekijken'], MANAGE = ['freelancers'], NONE = ['team']
const u = 'http://hub.test/api/x'
const json = (method: string, body?: unknown) => new Request(u, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const pid = (id = F) => ({ params: Promise.resolve({ id }) })
const pfile = () => ({ params: Promise.resolve({ id: A, fileId: FILE }) })
const writes = () => state.calls.filter(c => c.op !== 'select')
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x'

beforeEach(() => {
  state.user = null; state.calls = []; state.handler = () => undefined; state.storage = []; state.drive = []
  state.after = []; state.auth = null; state.claude = []
})

const ROUTES: { name: string; level: 'bekijken' | 'beheren'; call: () => Promise<Response> }[] = [
  { name: 'GET freelancers', level: 'bekijken', call: () => list.GET(json('GET')) },
  { name: 'POST freelancers', level: 'beheren', call: () => list.POST(json('POST', { name: 'Jan', disciplines: ['video'] })) },
  { name: 'GET freelancer', level: 'bekijken', call: () => one.GET(json('GET'), pid()) },
  { name: 'PATCH freelancer', level: 'beheren', call: () => one.PATCH(json('PATCH', { phone: '1' }), pid()) },
  { name: 'DELETE freelancer', level: 'beheren', call: () => one.DELETE(json('DELETE'), pid()) },
  { name: 'POST archive', level: 'beheren', call: () => archive.POST(json('POST'), pid()) },
  { name: 'DELETE archive', level: 'beheren', call: () => archive.DELETE(json('DELETE'), pid()) },
  { name: 'PUT rating', level: 'beheren', call: () => rating.PUT(json('PUT', { overall_rating: 4 }), pid()) },
  { name: 'GET link', level: 'beheren', call: () => link.GET(json('GET'), pid()) },
  { name: 'POST link', level: 'beheren', call: () => link.POST(json('POST'), pid()) },
  { name: 'DELETE link', level: 'beheren', call: () => link.DELETE(json('DELETE'), pid()) },
  { name: 'POST link/pin', level: 'beheren', call: () => linkPin.POST(json('POST'), pid()) },
  { name: 'GET link/url', level: 'beheren', call: () => linkUrl.GET(json('GET'), pid()) },
  { name: 'POST avatar', level: 'beheren', call: () => avatar.POST(json('POST', { contentType: 'image/png', size: 10 }), pid()) },
  { name: 'GET assignments', level: 'bekijken', call: () => assignments.GET(json('GET')) },
  { name: 'POST assignments', level: 'beheren', call: () => assignments.POST(json('POST', { freelancer_id: F, title: 'X' })) },
  { name: 'GET assignment', level: 'bekijken', call: () => assignment.GET(json('GET'), pid(A)) },
  { name: 'PATCH assignment', level: 'beheren', call: () => assignment.PATCH(json('PATCH', { title: 'Y' }), pid(A)) },
  { name: 'POST transition', level: 'beheren', call: () => transition.POST(json('POST', { to: 'afgerond' }), pid(A)) },
  { name: 'PUT review', level: 'beheren', call: () => review.PUT(json('PUT', { score: 4 }), pid(A)) },
  { name: 'POST upload-session', level: 'beheren', call: () => session.POST(json('POST', { files: [{ name: 'a.pdf', size: 1 }] }), pid(A)) },
  { name: 'POST finalize', level: 'beheren', call: () => finalize.POST(json('POST', { uploads: [{ uploadUrl: UPLOAD, size: 1 }] }), pid(A)) },
  { name: 'GET file', level: 'bekijken', call: () => file.GET(json('GET'), pfile()) },
  { name: 'DELETE file', level: 'beheren', call: () => file.DELETE(json('DELETE'), pfile()) },
  { name: 'GET disciplines', level: 'bekijken', call: () => disciplines.GET(json('GET')) },
  { name: 'POST disciplines', level: 'beheren', call: () => disciplines.POST(json('POST', { label: 'Drone' })) },
  { name: 'PATCH discipline', level: 'beheren', call: () => discipline.PATCH(json('PATCH', { label: 'Drone' }), { params: Promise.resolve({ key: 'drone' }) }) },
  { name: 'POST match', level: 'beheren', call: () => match.POST(json('POST', { description: 'video' })) },
]

describe('rechten per route', () => {
  for (const r of ROUTES) {
    it(`${r.name}: niet ingelogd → 401`, async () => {
      expect((await r.call()).status).toBe(401)
      expect(state.calls).toEqual([])
    })
    it(`${r.name}: geen recht of geen permissions-object → 403, zonder database`, async () => {
      for (const s of [NONE, null]) {
        state.user = user(s)
        expect((await r.call()).status).toBe(403)
      }
      expect(state.calls).toEqual([])
      expect(state.drive).toEqual([])
    })
    it(`${r.name}: bekijken → ${r.level === 'beheren' ? '403' : 'toegelaten'}`, async () => {
      state.user = user(VIEW)
      const status = (await r.call()).status
      if (r.level === 'beheren') { expect(status).toBe(403); expect(state.calls).toEqual([]) }
      else expect([401, 403]).not.toContain(status)
    })
    it(`${r.name}: beheren (oude sleutel) → toegelaten`, async () => {
      state.user = user(MANAGE)
      expect([401, 403]).not.toContain((await r.call()).status)
    })
  }
})

describe('statusovergangen via de route', () => {
  beforeEach(() => { state.user = user(MANAGE) })
  const withStatus = (status: string, updated = true): Handler => c => {
    if (c.table === 'freelancer_assignments' && c.op === 'select') return { data: { id: A, freelancer_id: F, status, shared_at: null } }
    if (c.table === 'freelancer_assignments' && c.op === 'update') return { data: updated ? { id: A, status: (c.payload as { status: string }).status } : null }
    return undefined
  }

  it('toegelaten: opgeleverd → afgerond, met status_changed_at en een event', async () => {
    state.handler = withStatus('opgeleverd')
    const res = await transition.POST(json('POST', { to: 'afgerond' }), pid(A))
    expect(res.status).toBe(200)
    const upd = writes().find(c => c.table === 'freelancer_assignments')!
    expect(upd.payload).toMatchObject({ status: 'afgerond' })
    expect(upd.filters).toContain('eq:status=opgeleverd')     // alleen als de status niet intussen veranderde
    expect(writes().find(c => c.table === 'freelancer_assignment_events')!.payload)
      .toMatchObject({ from_status: 'opgeleverd', to_status: 'afgerond', actor_type: 'team', actor_id: 'u1', visible_to_freelancer: false })
  })

  it('terugsturen zonder bericht → 400; met bericht zichtbaar voor de freelancer', async () => {
    state.handler = withStatus('opgeleverd')
    expect((await transition.POST(json('POST', { to: 'geaccepteerd' }), pid(A))).status).toBe(400)
    expect(writes()).toEqual([])
    const ok = await transition.POST(json('POST', { to: 'geaccepteerd', message: 'Logo groter aub' }), pid(A))
    expect(ok.status).toBe(200)
    expect(writes().find(c => c.table === 'freelancer_assignment_events')!.payload)
      .toMatchObject({ message: 'Logo groter aub', visible_to_freelancer: true })
  })

  for (const [from, to] of [['concept', 'afgerond'], ['gedeeld', 'geaccepteerd'], ['geaccepteerd', 'opgeleverd'], ['afgerond', 'geannuleerd'], ['geannuleerd', 'concept']]) {
    it(`geweigerd voor het team: ${from} → ${to} (409, niets geschreven)`, async () => {
      state.handler = withStatus(from)
      expect((await transition.POST(json('POST', { to, message: 'x' }), pid(A))).status).toBe(409)
      expect(writes()).toEqual([])
    })
  }

  it('gelijktijdig gewijzigd → 409', async () => {
    state.handler = withStatus('opgeleverd', false)
    expect((await transition.POST(json('POST', { to: 'afgerond' }), pid(A))).status).toBe(409)
  })

  it('een onbekende status → 400', async () => {
    expect((await transition.POST(json('POST', { to: 'nieuw' }), pid(A))).status).toBe(400)
  })
})

describe('delen en de persoonlijke link', () => {
  beforeEach(() => { state.user = user(MANAGE) })

  it('delen zonder link maakt er één; de pincode staat één keer in het antwoord, nooit in de database', async () => {
    state.handler = c => {
      if (c.table === 'freelancer_assignments' && c.op === 'select') return { data: { id: A, freelancer_id: F, status: 'concept', shared_at: null } }
      if (c.table === 'freelancer_assignments' && c.op === 'update') return { data: { id: A, status: 'gedeeld' } }
      if (c.table === 'freelancer_links' && c.op === 'select') return { data: null }
      if (c.table === 'freelancers') return { data: { id: F, archived_at: null } }
      return undefined
    }
    const res = await transition.POST(json('POST', { to: 'gedeeld' }), pid(A))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json() as { link: { url: string; pin: string } }
    expect(body.link.pin).toMatch(/^\d{4}$/)
    expect(body.link.url).toMatch(/\/f#[A-Za-z0-9_-]{43}$/)
    const token = body.link.url.split('#')[1]

    const ins = writes().find(c => c.table === 'freelancer_links' && c.op === 'insert')!
    const stored = JSON.stringify(ins.payload)
    expect(stored).not.toContain(token)
    expect(stored).not.toContain(`"${body.link.pin}"`)
    expect((ins.payload as { pin_hash: string }).pin_hash).toMatch(/^scrypt\$/)
    // eerst de link, dan de status
    const order = writes().map(c => `${c.table}.${c.op}`)
    expect(order.indexOf('freelancer_links.insert')).toBeLessThan(order.indexOf('freelancer_assignments.update'))
    expect(writes().find(c => c.table === 'freelancer_assignments')!.payload).toMatchObject({ status: 'gedeeld', shared_at: expect.any(String) })
  })

  it('delen met een bestaande link maakt geen nieuwe en geeft geen pincode', async () => {
    state.handler = c => {
      if (c.table === 'freelancer_assignments' && c.op === 'select') return { data: { id: A, freelancer_id: F, status: 'concept', shared_at: null } }
      if (c.table === 'freelancer_assignments' && c.op === 'update') return { data: { id: A, status: 'gedeeld' } }
      if (c.table === 'freelancer_links' && c.op === 'select') return { data: { id: 'l1', token_encrypted: '\\x00', created_at: 'x', last_opened_at: null, locked_until: null, lockout_count: 0, lockout_window_start: null } }
      return undefined
    }
    const body = await (await transition.POST(json('POST', { to: 'gedeeld' }), pid(A))).json() as { link: unknown }
    expect(body.link).toBe(null)
    expect(writes().some(c => c.table === 'freelancer_links')).toBe(false)
  })

  it('de linkstatus geeft nooit token, hash of pincode', async () => {
    state.handler = c => c.table === 'freelancer_links'
      ? { data: { id: 'l1', token_encrypted: '\\xdeadbeef', created_at: '2026-11-01T00:00:00Z', last_opened_at: null, locked_until: null, lockout_count: 0, lockout_window_start: null } }
      : undefined
    const body = await (await link.GET(json('GET'), pid())).json()
    expect(body).toEqual({ state: 'actief', created_at: '2026-11-01T00:00:00Z', last_opened_at: null, locked_until: null, needs_new_pin: false })
  })

  it('3 blokkeringen binnen 24 u → geblokkeerd tot er een nieuwe pincode is', async () => {
    state.handler = c => c.table === 'freelancer_links'
      ? { data: { id: 'l1', token_encrypted: '\\x00', created_at: 'x', last_opened_at: null, locked_until: null, lockout_count: 3, lockout_window_start: new Date().toISOString() } }
      : undefined
    expect(await (await link.GET(json('GET'), pid())).json()).toMatchObject({ state: 'geblokkeerd', needs_new_pin: true })
  })

  it('nieuwe pincode heft de blokkering op en staat alleen in het antwoord', async () => {
    state.handler = c => c.table === 'freelancer_links' && c.op === 'select'
      ? { data: { id: 'l1', token_encrypted: '\\x00', created_at: 'x', last_opened_at: null, locked_until: 'x', lockout_count: 3, lockout_window_start: 'x' } }
      : undefined
    const body = await (await linkPin.POST(json('POST'), pid())).json() as { pin: string }
    expect(body.pin).toMatch(/^\d{4}$/)
    const upd = writes().find(c => c.table === 'freelancer_links')!.payload as Record<string, unknown>
    expect(upd).toMatchObject({ failed_pin_attempts: 0, locked_until: null, lockout_count: 0 })
    expect(JSON.stringify(upd)).not.toContain(`"${body.pin}"`)
  })

  it('geen link voor een gearchiveerde freelancer', async () => {
    state.handler = c => (c.table === 'freelancers' ? { data: { id: F, archived_at: '2026-01-01' } } : undefined)
    expect((await link.POST(json('POST'), pid())).status).toBe(409)
    expect(writes()).toEqual([])
  })
})

describe('bestanden: geen bytes door onze functions', () => {
  beforeEach(() => { state.user = user(VIEW) })
  const fileRow = (over: Record<string, unknown> = {}): Handler => c => {
    if (c.table === 'freelancer_assignments') return { data: { id: A } }
    if (c.table === 'freelancer_assignment_files' && c.op === 'select') return { data: { id: FILE, storage_provider: 'drive', drive_file_id: 'drive-1', file_url: null, web_view_link: meta.webViewLink, public_shared_at: null, public_permission_id: null, file_name: 'a.png', ...over } }
    return undefined
  }

  it('download = 302 naar Drive na een tijdelijke deling; niets gestreamd; opruimen na het antwoord', async () => {
    state.handler = fileRow()
    const res = await file.GET(json('GET'), pfile())
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/^https:\/\/drive\.usercontent\.google\.com\/download\?id=drive-1/)
    expect(res.body).toBe(null)
    expect(state.drive).toEqual(['share:drive-1'])
    expect(writes().find(c => c.table === 'freelancer_assignment_files')!.payload).toMatchObject({ public_permission_id: 'perm-1' })
    expect(state.after).toHaveLength(1)
  })

  it('een lopende deling (< 1 uur) wordt hergebruikt, niet verlengd', async () => {
    state.handler = fileRow({ public_shared_at: new Date(Date.now() - 10 * 60_000).toISOString(), public_permission_id: 'perm-0' })
    expect((await file.GET(json('GET'), pfile())).status).toBe(302)
    expect(state.drive).toEqual([])
    expect(writes()).toEqual([])
  })

  it('een oud bestand in Supabase Storage: 302 naar een signed URL', async () => {
    state.handler = fileRow({ storage_provider: 'supabase', drive_file_id: null, file_url: 'oud/pad.pdf' })
    const res = await file.GET(json('GET'), pfile())
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('supa.example/signed')
  })

  it('in de broncode van de downloadroutes wordt niets gestreamd', () => {
    for (const p of ['src/app/api/freelancers/assignments/[id]/files/[fileId]/route.ts', 'src/features/freelancers/lib/files-server.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '../../..', p), 'utf8')
      expect(src).not.toMatch(/downloadFile|arrayBuffer|Readable|formData\(/)
    }
  })

  it('upload-session: weigert een verboden type, opent anders sessies in de map van de opdracht', async () => {
    state.user = user(MANAGE)
    state.handler = c => (c.table === 'freelancer_assignments' ? { data: { id: A, freelancer_id: F } } : c.table === 'freelancer_assignment_files' ? { count: 0 } : undefined)
    expect((await session.POST(json('POST', { files: [{ name: 'virus.exe', size: 1 }] }), pid(A))).status).toBe(400)
    const ok = await session.POST(json('POST', { files: [{ name: 'brief.pdf', size: 5 }] }), pid(A))
    expect(ok.status).toBe(200)
    expect(state.drive).toEqual([`folder:Freelancers/${F}/${A}`, 'session:brief.pdf'])
  })

  it('finalize: een bestand buiten de map van de opdracht wordt geweigerd', async () => {
    state.user = user(MANAGE)
    state.handler = c => (c.table === 'freelancer_assignments' ? { data: { id: A, freelancer_id: F } } : undefined)
    meta.parents = ['andere-map']
    const res = await finalize.POST(json('POST', { uploads: [{ uploadUrl: UPLOAD, size: 10 }] }), pid(A))
    meta.parents = ['folder-ok']
    expect(await res.json()).toEqual({ results: [{ ok: false, error: 'Dit bestand hoort niet bij deze opdracht.' }] })
    expect(writes()).toEqual([])
  })

  it('finalize: registreert wat Drive zegt, niet wat de browser zegt', async () => {
    state.user = user(MANAGE)
    state.handler = c => (c.table === 'freelancer_assignments' ? { data: { id: A, freelancer_id: F } } : c.table === 'freelancer_assignment_files' ? { data: { id: FILE } } : undefined)
    const res = await finalize.POST(json('POST', { uploads: [{ uploadUrl: UPLOAD, size: 999 }] }), pid(A))
    expect(await res.json()).toEqual({ results: [{ ok: true, id: FILE, name: 'logo.png' }] })
    expect(writes().find(c => c.table === 'freelancer_assignment_files')!.payload)
      .toMatchObject({ file_name: 'logo.png', file_size: 10, kind: 'briefing', uploaded_by: 'team', storage_provider: 'drive', drive_file_id: 'drive-1' })
  })
})

describe('reviews en beoordeling', () => {
  beforeEach(() => { state.user = user(MANAGE) })

  it('review alleen op een afgeronde opdracht', async () => {
    state.handler = c => (c.table === 'freelancer_assignments' ? { data: { status: 'opgeleverd' } } : undefined)
    expect((await review.PUT(json('PUT', { score: 4 }), pid(A))).status).toBe(409)
    expect(writes()).toEqual([])
    state.handler = c => (c.table === 'freelancer_assignments' ? { data: { status: 'afgerond' } } : c.table === 'freelancer_reviews' ? { data: { id: 'r1' } } : undefined)
    expect((await review.PUT(json('PUT', { score: 4 }), pid(A))).status).toBe(200)
    expect(writes().map(c => c.table)).toEqual(['freelancer_reviews'])   // overall_rating blijft ongemoeid
  })

  it('overall_rating wordt alleen in /rating geschreven, en review_avg nergens', () => {
    const root = path.resolve(__dirname, '../../..')
    const walk = (d: string): string[] => fs.readdirSync(d).flatMap(n => {
      const p = path.join(d, n)
      return fs.statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.tsx?$/.test(n) ? [p] : []
    })
    const writers: string[] = []
    for (const p of walk(path.join(root, 'src'))) {
      const src = fs.readFileSync(p, 'utf8')
      // Een schrijfactie = .update/.insert/.upsert({ … }) met dat veld erin.
      const writesTo = (field: string) => new RegExp(`\\.(update|insert|upsert)\\(\\{[^)]*\\b${field}\\b`, 's').test(src)
      if (writesTo('overall_rating')) writers.push(path.relative(root, p))
      expect(writesTo('review_avg'), path.relative(root, p)).toBe(false)
    }
    expect(writers).toEqual(['src/app/api/freelancers/[id]/rating/route.ts'])
  })

  it('de profiel-PATCH weigert overall_rating, archived_at en avatar_url', async () => {
    for (const body of [{ overall_rating: 5 }, { archived_at: null }, { avatar_url: 'x' }, { review_avg: 5 }]) {
      expect((await one.PATCH(json('PATCH', body), pid())).status).toBe(400)
    }
    expect(writes()).toEqual([])
  })

  it('beschikbaarheid door het team wijzigen zet de bron op "team"', async () => {
    state.handler = c => (c.table === 'freelancers' ? { data: { id: F } } : undefined)
    await one.PATCH(json('PATCH', { availability: 'beperkt', available_from: '2026-12-01' }), pid())
    expect(writes()[0].payload).toMatchObject({ availability: 'beperkt', availability_updated_by: 'team', availability_updated_at: expect.any(String) })
  })

  it('een freelancer met opdrachten verwijderen → 409 (archiveren)', async () => {
    state.handler = c => (c.table === 'freelancer_assignments' ? { count: 2 } : undefined)
    expect((await one.DELETE(json('DELETE'), pid())).status).toBe(409)
    expect(writes()).toEqual([])
  })
})

describe('geen bedragen per opdracht', () => {
  beforeEach(() => { state.user = user(MANAGE) })

  it('nieuwe opdracht en opdracht-PATCH weigeren agreed_amount', async () => {
    expect((await assignments.POST(json('POST', { freelancer_id: F, title: 'X', agreed_amount: 500 }))).status).toBe(400)
    expect((await assignment.PATCH(json('PATCH', { agreed_amount: 500 }), pid(A))).status).toBe(400)
    expect(writes()).toEqual([])
  })

  it('geen code buiten de migraties gebruikt agreed_amount (de kolom is ongebruikt)', () => {
    const root = path.resolve(__dirname, '../../..')
    const walk = (d: string): string[] => fs.readdirSync(d).flatMap(n => {
      const p = path.join(d, n)
      return fs.statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []
    })
    const hits = walk(path.join(root, 'src')).filter(p => /agreed_?amount/i.test(fs.readFileSync(p, 'utf8'))).map(p => path.relative(root, p))
    expect(hits).toEqual([])
  })
})

describe('cron en match', () => {
  it('cron zonder of met fout geheim → 401, zonder database', async () => {
    expect((await cron.GET(new Request('http://hub.test/api/cron/freelancer-shares'))).status).toBe(401)
    state.auth = 'Bearer fout'
    expect((await cron.GET(new Request('http://hub.test/api/cron/freelancer-shares'))).status).toBe(401)
    expect(state.calls).toEqual([])
  })

  it('cron met geheim trekt verlopen delingen in', async () => {
    state.auth = 'Bearer cron-geheim'
    state.handler = c => (c.table === 'freelancer_assignment_files' && c.op === 'select'
      ? { data: [{ id: FILE, drive_file_id: 'drive-1', public_permission_id: 'perm-9' }] } : undefined)
    const body = await (await cron.GET(new Request('http://hub.test/api/cron/freelancer-shares'))).json()
    expect(body).toMatchObject({ modus: 'uur', verlopen: { ingetrokken: 1, mislukt: 0 } })
    expect(state.drive).toEqual(['revoke:drive-1:perm-9'])
  })

  it('match: harde voorfilter vóór het model; ID\'s buiten de kandidaten vallen weg', async () => {
    const { prefilter, rankWithClaude } = await import('@/features/freelancers/lib/match')
    const base = { disciplines: ['video'], status: 'vast', availability: 'beschikbaar', available_from: null, archived_at: null, overall_rating: 4, rate_amount: null, rate_unit: null, rate_note: null, notes: null, review_avg: 4.5, review_count: 2 }
    const all = [
      { ...base, id: 'a', name: 'A' },
      { ...base, id: 'b', name: 'B', disciplines: ['foto'] },
      { ...base, id: 'c', name: 'C', availability: 'niet_beschikbaar' },
      { ...base, id: 'd', name: 'D', availability: 'niet_beschikbaar', available_from: '2026-12-01' },
      { ...base, id: 'e', name: 'E', status: 'inactief' },
      { ...base, id: 'f', name: 'F', archived_at: '2026-01-01' },
    ]
    expect(prefilter(all, { discipline: 'video', deadline: '2026-12-10', today: '2026-11-13' }).map(f => f.id)).toEqual(['a', 'd'])
    expect(prefilter(all, { discipline: 'video', deadline: null, today: '2026-11-13' }).map(f => f.id)).toEqual(['a'])

    const fake = { beta: { messages: { parse: async (p: unknown) => { state.claude.push(p); return { parsed_output: { matches: [
      { id: 'verzonnen', reden: 'x', aandachtspunt: null }, { id: 'a', reden: 'Past goed', aandachtspunt: ' ' }, { id: 'a', reden: 'dubbel', aandachtspunt: null },
    ] }, stop_reason: 'end_turn' } } } } }
    const r = await rankWithClaude('video', [all[0]], {}, fake as never)
    expect(r).toEqual([{ id: 'a', rank: 1, reden: 'Past goed', aandachtspunt: null }])
    const sent = JSON.stringify(state.claude[0])
    expect(sent).toContain('"model":"claude-sonnet-5-5"')
    expect(sent).toContain('"fallbacks":"default"')
    expect(sent).toContain('server-side-fallback-2026-07-01')
    expect(sent).toContain('1–5')
    expect(sent).not.toContain('/10')
  })

  it('match: een weigering van het model wordt een fout, geen lege of gegokte lijst', async () => {
    const { rankWithClaude } = await import('@/features/freelancers/lib/match')
    const refusing = { beta: { messages: { parse: async () => ({ parsed_output: null, stop_reason: 'refusal' }) } } }
    const c = { id: 'a', name: 'A', disciplines: [], status: 'vast', availability: 'beschikbaar', available_from: null, archived_at: null, overall_rating: null, rate_amount: null, rate_unit: null, rate_note: null, notes: null, review_avg: null, review_count: 0 }
    await expect(rankWithClaude('x', [c], {}, refusing as never)).rejects.toThrow(/weigerde/)
  })

  it('match zonder kandidaten roept het model niet aan', async () => {
    state.user = user(MANAGE)
    state.handler = c => (c.table === 'freelancers' ? { data: [] } : undefined)
    const body = await (await match.POST(json('POST', { description: 'video' }))).json()
    expect(body).toEqual({ kandidaten: 0, matches: [] })
    expect(state.claude).toEqual([])
  })
})
