import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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
// Een oud account met de freelancer-vlag (die bestaan niet meer, B4) wordt
// behandeld als elk ander account: nooit meer naar een portaal.
const flagged = { id: 'f', email: 'free@example.com', app_metadata: { freelancer: true } }

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

  it.each(['/', '/login'])('signed-in staff on %s goes to /dashboard', async (path) => {
    sessionUser = staff
    expect(await visit(path)).toEqual({ status: 307, to: '/dashboard' })
  })

  it.each(['/dashboard', '/privacy', '/terms'])('signed-in staff can open %s', async (path) => {
    sessionUser = staff
    expect(await visit(path)).toEqual({ status: 200, to: null })
  })

  it.each(['/', '/login'])('an account with the old freelancer flag on %s goes to /dashboard, not /portal', async (path) => {
    sessionUser = flagged
    expect(await visit(path)).toEqual({ status: 307, to: '/dashboard' })
  })

  it.each(['/dashboard', '/privacy', '/portal'])('nobody is redirected to a portal from %s', async (path) => {
    sessionUser = flagged
    expect((await visit(path)).to).not.toBe('/portal')
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
