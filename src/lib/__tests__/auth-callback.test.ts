import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Na het inloggen gaat iedereen naar waar hij heen wou, of naar /dashboard.
// Niemand gaat nog naar /portal: niet op basis van app_metadata.freelancer en
// niet omdat zijn e-mailadres ook in de freelancerlijst staat
// (docs/freelancers-overzicht.md, Fase 3).

const state: { user: unknown; adminUsed: number } = { user: null, adminUsed: 0 }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: state.user } }),
    },
    // Zou de route de freelancerlijst nog raadplegen, dan zag ze hier een treffer.
    from: () => { state.adminUsed++; return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'f1' } }) }) }) } },
  }),
  createAdminClient: () => {
    state.adminUsed++
    return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'f1' } }) }) }) }) }
  },
}))

const { GET } = await import('@/app/auth/callback/route')
const go = async (q: string) => {
  const res = await GET(new NextRequest(new URL(`/auth/callback?${q}`, 'https://hub.example.com')))
  return new URL(res.headers.get('location')!).pathname
}

beforeEach(() => { state.user = null; state.adminUsed = 0 })

describe('auth/callback', () => {
  it('een collega die ook in de freelancerlijst staat, gaat naar /dashboard, niet naar /portal', async () => {
    state.user = { id: 'c1', email: 'jana@sporthousegroup.com', app_metadata: { permissions: { sections: ['team'] } } }
    expect(await go('code=x')).toBe('/dashboard')
    expect(state.adminUsed).toBe(0)
  })

  it('… of naar de pagina waar hij heen wou', async () => {
    state.user = { id: 'c1', email: 'jana@sporthousegroup.com', app_metadata: {} }
    expect(await go('code=x&next=/freelancers')).toBe('/freelancers')
  })

  it('een account met de oude freelancer-vlag gaat ook niet naar /portal', async () => {
    state.user = { id: 'f', email: 'free@example.com', app_metadata: { freelancer: true } }
    expect(await go('code=x')).toBe('/dashboard')
  })

  it('zonder code of gebruiker: terug naar /login', async () => {
    expect(await go('')).toBe('/login')
    expect(await go('code=x')).toBe('/login')
  })
})
