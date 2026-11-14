import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

// Who gets to see what without signing in. The homepage, /privacy and /terms
// must answer anonymous visitors — Google's OAuth verification checks them —
// while everything else keeps sending them to /login, and signed-in users keep
// landing where they always did.

let sessionUser: unknown = null
vi.mock('@/lib/supabase/claims', () => ({ getSessionUser: async () => sessionUser }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({}) }))

const { updateSession } = await import('@/lib/supabase/middleware')
const { config } = await import('@/middleware')
const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server')

const VERIFICATION = '/google3bff64dd6bd354bb.html'

const staff = { id: 's', email: 'staff@example.com', app_metadata: {} }
const freelancer = { id: 'f', email: 'free@example.com', app_metadata: { freelancer: true } }

async function visit(path: string) {
  const res = await updateSession(new NextRequest(new URL(path, 'https://hub.example.com')))
  const location = res.headers.get('location')
  return { status: res.status, to: location ? new URL(location).pathname : null }
}

describe('middleware: public pages and redirects', () => {
  beforeEach(() => { sessionUser = null })

  it.each(['/', '/privacy', '/terms', '/login', '/auth/callback', VERIFICATION])('anonymous visitor can open %s', async (path) => {
    expect(await visit(path)).toEqual({ status: 200, to: null })
  })

  it.each(['/dashboard', '/clients', '/privacy-extra', '/terms-old', '/google3bff64dd6bd354bb.html/x', '/other.html'])('anonymous visitor on %s goes to /login', async (path) => {
    expect(await visit(path)).toEqual({ status: 307, to: '/login' })
  })

  it('anonymous API call gets 401', async () => {
    expect((await visit('/api/clients')).status).toBe(401)
  })

  // Optie a uit docs/freelancers-redesign.md: alleen deze ene cronroute komt
  // zonder login door (ze controleert zelf CRON_SECRET).
  it('the freelancer share cron passes without a login', async () => {
    expect(await visit('/api/cron/freelancer-shares')).toEqual({ status: 200, to: null })
    expect(await visit('/api/cron/freelancer-shares?modus=nacht')).toEqual({ status: 200, to: null })
  })

  it.each([
    '/api/cron/expire-users', '/api/cron/purge-trash', '/api/cron/iets-nieuws',
    '/api/cron/freelancer-shares/x', '/api/cron/freelancer-shares-extra', '/api/cron',
    '/api/freelancers', '/api/freelancers/match', '/api/admin/users', '/api/files/finalize',
  ])('anonymous call to %s still gets 401', async (path) => {
    expect((await visit(path)).status).toBe(401)
  })

  it.each(['/', '/login'])('signed-in staff on %s goes to /dashboard', async (path) => {
    sessionUser = staff
    expect(await visit(path)).toEqual({ status: 307, to: '/dashboard' })
  })

  it.each(['/dashboard', '/privacy', '/terms'])('signed-in staff can open %s', async (path) => {
    sessionUser = staff
    expect(await visit(path)).toEqual({ status: 200, to: null })
  })

  it.each(['/', '/login', '/dashboard'])('freelancer on %s goes to /portal', async (path) => {
    sessionUser = freelancer
    expect(await visit(path)).toEqual({ status: 307, to: '/portal' })
  })

  it.each(['/portal', '/privacy', '/terms', '/auth/callback'])('freelancer can open %s', async (path) => {
    sessionUser = freelancer
    expect(await visit(path)).toEqual({ status: 200, to: null })
  })
})

// The matcher decides whether the middleware runs at all. Files it skips are
// served as-is to anyone — so the list of skipped paths must stay short.
describe('middleware matcher', () => {
  const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url })

  it.each([VERIFICATION, '/robots.txt', '/sitemap.xml', '/fonts/Satoshi-Regular.otf', '/logo.png'])(
    'skips %s, so crawlers get the file itself', (url) => {
      expect(runs(url)).toBe(false)
    })

  it.each(['/', '/privacy', '/terms', '/dashboard', '/clients/1', '/api/clients', '/admin',
    '/google3bff64dd6bd354bb.htmlx', '/other.html', '/api/google3bff64dd6bd354bb.html'])(
    'still runs on %s', (url) => {
      expect(runs(url)).toBe(true)
    })
})


// ── De persoonlijke freelancerlink ──────────────────────────────────────────
// Alleen /f(/…) en /api/public/f/* zijn zonder medewerker-login bereikbaar.
// De linkcookie is GEEN Supabase-sessie: met alleen die cookie geeft elke
// interne API-route 401 en elke interne pagina gaat naar /login.

const LINK_COOKIE = 'sh_fl=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.9999999999.' + 'A'.repeat(43)

async function visitWithLinkCookie(p: string) {
  const req = new NextRequest(new URL(p, 'https://hub.example.com'), { headers: { cookie: LINK_COOKIE } })
  const res = await updateSession(req)
  const location = res.headers.get('location')
  return { status: res.status, to: location ? new URL(location).pathname : null, headers: res.headers }
}

// Elke API-route in de code, als pad (dynamische segmenten ingevuld).
function apiRoutes(): string[] {
  const root = path.resolve(__dirname, '../../app/api')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (n === 'route.ts') out.push('/api/' + path.relative(root, dir).split(path.sep).join('/').replace(/\[[^\]]+\]/g, '11111111-1111-4111-8111-111111111111'))
    }
  }
  walk(root)
  return out.sort()
}

// Routes die al vóór de link zonder login bereikbaar waren (eigen controle in
// de route) — de link voegt hier niets aan toe.
const OWN_AUTH = ['/api/save-reel', '/api/planning/mine', '/api/materiaal/mail/due', '/api/cron/freelancer-shares']
const isPublicLink = (p: string) => p.startsWith('/api/public/f/')
const internal = apiRoutes().filter(p => !isPublicLink(p) && !OWN_AUTH.some(o => p === o || p.startsWith(o + '/')))

describe('middleware: persoonlijke freelancerlink', () => {
  beforeEach(() => { sessionUser = null })

  it.each(['/f', '/f/', '/api/public/f/session', '/api/public/f/me', '/api/public/f/assignments/x'])('%s is bereikbaar zonder login, met de beveiligingsheaders', async (p) => {
    const res = await updateSession(new NextRequest(new URL(p, 'https://hub.example.com')))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBe(null)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/)
  })

  it.each(['/fx', '/freelancers', '/f-test', '/api/public', '/api/public/fx', '/api/public/g/me'])('%s valt NIET onder de link', async (p) => {
    const r = await visit(p)
    expect(r.status === 401 || r.to === '/login').toBe(true)
  })

  it('er zijn interne API-routes om te controleren', () => {
    expect(internal.length).toBeGreaterThan(100)
    expect(internal).toContain('/api/freelancers')
  })

  it('met alleen de linkcookie geeft ELKE interne API-route 401', async () => {
    const open: string[] = []
    for (const p of internal) {
      const r = await visitWithLinkCookie(p)
      if (r.status !== 401) open.push(`${p} → ${r.status}`)
    }
    expect(open).toEqual([])
  })

  it.each(['/dashboard', '/freelancers', '/freelancers/x', '/admin', '/portal'])('met alleen de linkcookie gaat %s naar /login', async (p) => {
    expect((await visitWithLinkCookie(p)).to).toBe('/login')
  })
})
