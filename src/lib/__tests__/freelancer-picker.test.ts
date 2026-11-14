import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migratie 0092 sluit de tabel freelancers af voor wie geen freelancerrecht
// heeft. De materiaalplanner moet freelancers blijven kunnen kiezen, en doet
// dat sindsdien via freelancer_picker() (alleen id + naam), niet meer via de
// tabel. Deze test bewaakt die route en de afspraken over wat er buiten de
// freelancertool nog aan de tabel mag raken.

type FakeUser = { id: string; app_metadata: Record<string, unknown> } | null
const state: { user: FakeUser; calls: string[]; picker: unknown } = { user: null, calls: [], picker: [] }

function builder(table: string) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'order', 'in']) q[m] = () => { state.calls.push(`${table}.${m}`); return q }
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return q
}
const client = () => ({
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    admin: { listUsers: async () => ({ data: { users: [] }, error: null }) },
  },
  from: (t: string) => builder(t),
  rpc: async (name: string) => { state.calls.push(`rpc:${name}`); return { data: state.picker, error: null } },
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client(), createAdminClient: () => client() }))

const options = await import('@/app/api/materiaal/options/route')
const ROOT = path.resolve(__dirname, '../../..')

beforeEach(() => { state.user = null; state.calls = []; state.picker = [] })

describe('materiaalplanner — freelancers kiezen', () => {
  it('haalt de freelancers via freelancer_picker, nooit rechtstreeks uit de tabel', async () => {
    // Iemand met materiaalrecht maar zonder enig freelancerrecht.
    state.user = { id: 'u1', app_metadata: { permissions: { sections: ['materiaal'] } } }
    state.picker = [{ id: 'f1', name: 'Jan' }]
    const res = (await options.GET())!
    expect(res.status).toBe(200)
    expect((await res.json()).freelancers).toEqual([{ id: 'f1', name: 'Jan' }])
    expect(state.calls).toContain('rpc:freelancer_picker')
    expect(state.calls.some(c => c.startsWith('freelancers.'))).toBe(false)
  })

  it('zonder materiaalrecht: 403 en geen lijst', async () => {
    state.user = { id: 'u1', app_metadata: { permissions: { sections: ['team'] } } }
    expect((await options.GET())!.status).toBe(403)
    expect(state.calls).not.toContain('rpc:freelancer_picker')
  })

  it('freelancer_picker geeft alleen id en naam, en alleen voor wie de materiaalplanner mag zien', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0092_freelancers_rls_niveaus.sql'), 'utf8')
    const fn = sql.slice(sql.indexOf('create or replace function public.freelancer_picker()'))
    expect(fn).toMatch(/returns table \(id uuid, name text\)/)
    expect(fn).toMatch(/security definer/)
    expect(fn).toMatch(/set search_path = ''/)
    expect(fn).toMatch(/where public\.gear_can\('materiaal'\)/)
    expect(fn).toMatch(/revoke all on function public\.freelancer_picker\(\) from public, anon/)
  })

  it('buiten de freelancertool (app/api/freelancers, features/freelancers) en het portaal leest geen code de tabel met de gewone gebruikersclient', () => {
    // Toegelaten: de service-role (createAdminClient / admin.) — die valt niet
    // onder RLS. De lijst staat in docs/freelancers-redesign.md §10.
    const allowed = new Set([
      'src/app/auth/callback/route.ts',          // admin-client
      'src/app/api/admin/users/[id]/route.ts',   // admin-client
      'src/lib/gear/mail-server.ts',             // admin-client
    ])
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        if (fs.statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        const rel = path.relative(ROOT, p)
        if (rel.startsWith('src/app/api/freelancers/') || rel.startsWith('src/features/freelancers/') || rel.startsWith('src/app/api/portal/') || rel.startsWith('src/app/portal/')) continue
        const src = fs.readFileSync(p, 'utf8')
        if (/from\(['"]freelancer(s|_projects)['"]\)/.test(src) && !allowed.has(rel)) offenders.push(rel)
      }
    }
    walk(path.join(ROOT, 'src'))
    expect(offenders).toEqual([])
  })
})
