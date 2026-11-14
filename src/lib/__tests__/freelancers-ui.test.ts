import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  applyFilters, filtersFromParams, groupOf, sortFreelancers, statusCounts, matchesSearch,
} from '@/features/freelancers/internal/list/filter'
import { ratingText, rateText, availabilitySource } from '@/features/freelancers/internal/format'
import type { AssignmentRow, Freelancer } from '@/features/freelancers/internal/types'

// Fase 5 (interne UI). Pure logica (filters in de URL, sorteren, groeperen)
// en de afspraak dat "bekijken" GEEN wijzigknoppen ziet: verborgen, niet
// uitgeschakeld. Gerenderd met react-dom/server (geen browser nodig).

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => '/freelancers', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const base: Freelancer = {
  id: 'f', name: 'Jan Janssens', email: 'jan@example.com', phone: '+32 470 00 00 00', disciplines: ['video'], status: 'vast',
  rate_amount: 350, rate_unit: 'dag', rate_note: null, portfolio_links: [{ label: 'Site', url: 'https://jan.example' }],
  notes: 'Sterk in drone', avatar_url: null, availability: 'beschikbaar', available_from: null,
  availability_updated_at: null, availability_updated_by: null, overall_rating: 4, overall_rating_note: null,
  archived_at: null, created_at: '2026-01-01', stats: { review_avg: 4.3, review_count: 7, active_assignments: 1, open_review_count: 0, last_assignment_at: '2026-11-01' },
}
const mk = (o: Partial<Freelancer>): Freelancer => ({ ...base, ...o, stats: o.stats === undefined ? base.stats : o.stats })
const labels = { video: 'Video', foto: 'Foto' }

describe('filters uit de URL', () => {
  it('standaard: Vast + Proefopdracht, sorteren op beoordeling', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual({ q: '', statuses: ['vast', 'proefopdracht'], disciplines: [], nowAvailable: false, sort: 'beoordeling' })
  })
  it('leest status, disciplines, zoekterm, nu beschikbaar en sortering; negeert onzin', () => {
    const f = filtersFromParams(new URLSearchParams('status=kandidaat,onzin&d=video,foto&q=jan&nu=1&sort=tarief'))
    expect(f).toEqual({ q: 'jan', statuses: ['kandidaat'], disciplines: ['video', 'foto'], nowAvailable: true, sort: 'tarief' })
    expect(filtersFromParams(new URLSearchParams('status=alle')).statuses).toBe('alle')
    expect(filtersFromParams(new URLSearchParams('sort=hack')).sort).toBe('beoordeling')
  })
})

describe('zoeken, filteren en sorteren', () => {
  const list = [
    mk({ id: 'a', name: 'Anna', overall_rating: 5 }),
    mk({ id: 'b', name: 'Bram', overall_rating: null, stats: { ...base.stats!, review_avg: 4.9 }, disciplines: ['foto'] }),
    mk({ id: 'c', name: 'Cas', status: 'kandidaat', availability: 'niet_beschikbaar', available_from: '2026-12-01' }),
    mk({ id: 'd', name: 'Dirk', overall_rating: 4, availability: 'beperkt', rate_amount: 500 }),
  ]
  it('zoekt op naam, discipline-label en notities, zonder accenten of hoofdletters', () => {
    expect(matchesSearch(list[0], 'ANNA', labels)).toBe(true)
    expect(matchesSearch(list[1], 'foto', labels)).toBe(true)
    expect(matchesSearch(list[0], 'drone', labels)).toBe(true)
    expect(matchesSearch(list[0], 'drône sterk', labels)).toBe(true)
    expect(matchesSearch(list[0], 'bram', labels)).toBe(false)
  })
  it('status, discipline (OF) en "nu beschikbaar"', () => {
    const f = filtersFromParams(new URLSearchParams('d=foto'))
    expect(applyFilters(list, f, labels, '2026-11-14').map(x => x.id)).toEqual(['b'])
    const now = filtersFromParams(new URLSearchParams('status=alle&nu=1'))
    expect(applyFilters(list, now, labels, '2026-11-14').map(x => x.id)).toEqual(['a', 'b'])
    expect(applyFilters(list, now, labels, '2026-12-02').map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('sorteert op totaalcijfer, met review_avg als terugval; ontbrekend achteraan', () => {
    expect(sortFreelancers(list, 'beoordeling').map(x => x.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(sortFreelancers(list, 'tarief').map(x => x.id)[0]).toBe('a')
  })
  it('telt per status', () => {
    expect(statusCounts(list)).toEqual({ vast: 3, proefopdracht: 0, kandidaat: 1, inactief: 0, alle: 4 })
  })
})

describe('weergave', () => {
  it('beoordeling als "★ 4 · opdrachten 4,3 (7)", ontbrekend weggelaten', () => {
    expect(ratingText(base)).toBe('★ 4 · opdrachten 4,3 (7)')
    expect(ratingText({ overall_rating: null, stats: base.stats })).toBe('opdrachten 4,3 (7)')
    expect(ratingText({ overall_rating: null, stats: null })).toBe('')
  })
  it('tarief en bron van de beschikbaarheid', () => {
    expect(rateText(base)).toBe('€350 / dag')
    expect(availabilitySource({ availability_updated_at: new Date().toISOString(), availability_updated_by: 'freelancer' })).toBe('door freelancer, vandaag')
  })
})

describe('opdrachten groeperen', () => {
  const a = (status: string, extra: Partial<AssignmentRow> = {}) => ({ id: status, freelancer_id: 'f', title: status, discipline: null, briefing: null, client_id: null, client_name: null, deadline: null, status, is_historical: false, shared_at: null, first_viewed_at: null, status_changed_at: new Date().toISOString(), created_at: '', ...extra }) as AssignmentRow
  it('"Wacht op ons" = opgeleverd, of afgerond zonder review', () => {
    expect(groupOf(a('opgeleverd'))).toBe('wacht')
    expect(groupOf(a('afgerond'))).toBe('wacht')
    expect(groupOf(a('afgerond', { review: { score: 4 } }))).toBe('recent')
    expect(groupOf(a('gedeeld'))).toBe('gedeeld')
    expect(groupOf(a('geaccepteerd'))).toBe('lopend')
    expect(groupOf(a('concept'))).toBe('concepten')
    expect(groupOf(a('afgerond', { is_historical: true }))).toBe(null)
  })
})

describe('"bekijken" ziet geen wijzigknoppen (verborgen, niet uitgeschakeld)', () => {
  it('profielkaarten: geen potloodjes zonder beheerrecht', async () => {
    const { default: ProfileOverview } = await import('@/features/freelancers/internal/profile/ProfileOverview')
    const view = renderToStaticMarkup(createElement(ProfileOverview, { f: base, disciplines: [], canManage: false, onChange: () => {} }))
    const manage = renderToStaticMarkup(createElement(ProfileOverview, { f: base, disciplines: [], canManage: true, onChange: () => {} }))
    expect(view).not.toMatch(/bewerken/)
    expect(manage.match(/bewerken"/g)).toHaveLength(6)
  })

  it('profielkop: geen foto wijzigen, geen statuskeuze, geen "Nieuwe opdracht"', async () => {
    const { default: ProfileHeader } = await import('@/features/freelancers/internal/profile/ProfileHeader')
    const view = renderToStaticMarkup(createElement(ProfileHeader, { f: base, labels, canManage: false, onChange: () => {} }))
    const manage = renderToStaticMarkup(createElement(ProfileHeader, { f: base, labels, canManage: true, onChange: () => {} }))
    for (const s of ['Foto wijzigen', '<select', 'Nieuwe opdracht']) {
      expect(view, s).not.toContain(s)
      expect(manage, s).toContain(s)
    }
    // Geen uitgeschakelde knoppen als vervanging: het attribuut disabled komt niet voor.
    expect(view).not.toMatch(/\sdisabled="/)
  })
})
