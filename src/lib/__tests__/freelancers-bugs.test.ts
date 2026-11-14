import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { applyFilters, filtersFromParams, groupOf } from '@/features/freelancers/internal/list/filter'
import {
  assignableClients, disciplineLabel, mergeFreelancer, saveStatus, seed, submitAssignment, type SubmitState,
} from '@/features/freelancers/internal/logic'
import type { AssignmentRow, Freelancer } from '@/features/freelancers/internal/types'

// Stap 1 van de herwerking: één test per gevonden bug. De logica zit in
// internal/logic.ts (te testen zonder browser); het laatste blok controleert
// dat de componenten die logica ook echt gebruiken.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => '/freelancers', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const f: Freelancer = {
  id: 'f', name: 'Jan', email: 'jan@example.com', phone: null, disciplines: ['video'], status: 'kandidaat',
  rate_amount: 350, rate_unit: 'dag', rate_note: null, portfolio_links: [], notes: 'oud', avatar_url: null,
  availability: 'beschikbaar', available_from: null, availability_updated_at: null, availability_updated_by: null,
  overall_rating: 4, overall_rating_note: null, archived_at: null, created_at: '2026-01-01',
  stats: { review_avg: 4.5, review_count: 2, active_assignments: 1, open_review_count: 0, last_assignment_at: '2026-11-01' },
}
const row = (status: string, extra: Partial<AssignmentRow> = {}) => ({ id: status, freelancer_id: 'f', title: status, discipline: null, briefing: null, client_id: null, client_name: null, deadline: null, status, is_historical: false, shared_at: null, first_viewed_at: null, status_changed_at: new Date().toISOString(), created_at: '', ...extra }) as AssignmentRow

describe('bug 1 — geweigerd/geannuleerd stond onder "Recent afgerond"', () => {
  it('komt niet in een groep van het bord', () => {
    expect(groupOf(row('geweigerd'))).toBe(null)
    expect(groupOf(row('geannuleerd'))).toBe(null)
    expect(groupOf(row('afgerond', { review: { score: 4 } }))).toBe('recent')
  })
})

describe('bug 2 — een nieuwe freelancer (kandidaat) verdween uit de standaardlijst', () => {
  it('de standaardfilter toont kandidaten, niet de inactieven', () => {
    const list = [f, { ...f, id: 'i', status: 'inactief' as const }]
    expect(applyFilters(list, filtersFromParams(new URLSearchParams()), {}, '2026-11-14').map(x => x.id)).toEqual(['f'])
  })
})

describe('bug 3 — discipline als ruwe sleutel in het opdrachtpaneel', () => {
  it('toont het label, met de sleutel als terugval', () => {
    expect(disciplineLabel('video', { video: 'Video & montage' })).toBe('Video & montage')
    expect(disciplineLabel('onbekend', {})).toBe('onbekend')
    expect(disciplineLabel(null, {})).toBe('—')
  })
})

describe('bug 4 — na bewerken verdwenen de cijfers (reviews, lopend) van het profiel', () => {
  it('een antwoord zonder stats houdt de vorige', () => {
    const next = { ...f, notes: 'nieuw', stats: undefined } as unknown as Freelancer // zoals PATCH antwoordt
    expect(mergeFreelancer(f, next).stats).toEqual(f.stats)
    expect(mergeFreelancer(f, next).notes).toBe('nieuw')
    expect(mergeFreelancer(f, { ...next, stats: { ...f.stats!, review_count: 3 } }).stats!.review_count).toBe(3)
  })
})

describe('bug 5 — "Annuleren" op een profielkaart hield de niet-bewaarde wijziging vast', () => {
  it('openen begint opnieuw bij de opgeslagen waarden', () => {
    const c = seed.contact(f)
    c.disciplines.push('foto'); c.name = 'getypt'
    expect(seed.contact(f)).toEqual({ name: 'Jan', phone: '', email: 'jan@example.com', disciplines: ['video'] })
    expect(f.disciplines).toEqual(['video']) // geen gedeelde array meer
    expect(seed.notes(f)).toBe('oud')
    expect(seed.rate(f)).toEqual({ amount: '350', unit: 'dag', note: '' })
  })
  it('de kaarten geven onEdit door aan EditableCard', async () => {
    const { default: EditableCard } = await import('@/features/freelancers/internal/profile/EditableCard')
    const html = renderToStaticMarkup(createElement(EditableCard, { title: 'X', canEdit: true, view: 'v', edit: 'e', onSave: async () => {}, onEdit: () => {} }))
    expect(html).toContain('X bewerken')
  })
})

describe('bug 6 — status wijzigen in de profielkop: fout werd een onafgehandelde rejection', () => {
  it('een fout wordt een melding', async () => {
    const r = await saveStatus(async () => { throw new Error('Geen recht') }, 'f', 'vast')
    expect(r).toEqual({ ok: false, error: 'Geen recht' })
    const ok = await saveStatus(async (_id, body) => ({ ...f, ...(body as object) }), 'f', 'vast')
    expect(ok.ok && ok.freelancer.status).toBe('vast')
  })
})

describe('bug 7 — nieuwe opdracht: opnieuw proberen na een fout maakte een tweede opdracht', () => {
  it('maakt de opdracht één keer aan en gaat verder waar hij stopte', async () => {
    let created = 0, uploads = 0, shares = 0
    const api = {
      create: async () => { created++; return { id: 'a1' } },
      upload: async () => { uploads++; return [] },
      share: async () => { shares++; if (shares === 1) throw new Error('netwerk'); return { link: null } },
    }
    const state: SubmitState = { createdId: null, uploaded: false }
    await expect(submitAssignment(api, state, true)).rejects.toThrow('netwerk')
    const r = await submitAssignment(api, state, true)
    expect(r.id).toBe('a1')
    expect({ created, uploads, shares }).toEqual({ created: 1, uploads: 1, shares: 2 })
  })
})

describe('bug 8 — waarschuwingen bij bijlagen gingen verloren als de link getoond werd', () => {
  it('de waarschuwingen komen mee met de link', async () => {
    const r = await submitAssignment({
      create: async () => ({ id: 'a2' }),
      upload: async () => ['"x.pdf" is niet geüpload.'],
      share: async () => ({ link: { url: 'https://hub/f#t', pin: '1234' } }),
    }, { createdId: null, uploaded: false }, true)
    expect(r.link?.pin).toBe('1234')
    expect(r.warnings).toEqual(['"x.pdf" is niet geüpload.'])
  })
  it('LinkReveal toont de melding', async () => {
    const { default: LinkReveal } = await import('@/features/freelancers/internal/LinkReveal')
    const html = renderToStaticMarkup(createElement(LinkReveal, { name: 'Jan', url: 'https://hub/f#t', pin: '1234', note: '"x.pdf" is niet geüpload.', onClose: () => {} }))
    expect(html).toContain('is niet geüpload')
  })
})

describe('bug 9 — interne afdelingen stonden als klant in de keuzelijst', () => {
  it('categorie "intern" valt weg; atleten, podcasts en klanten blijven', () => {
    const list = [{ id: '1', name: 'Arthur Vermeeren', category: 'atleet' }, { id: '2', name: 'Sporthouse', category: 'intern' }, { id: '3', name: 'KRC Genk', category: 'klant' }, { id: '4', name: 'Pod', category: 'podcast' }]
    expect(assignableClients(list).map(c => c.id)).toEqual(['1', '3', '4'])
  })
})

describe('bug 10 — kolomkoppen "Lop." en "Laatste" waren onduidelijk', () => {
  it('voluit geschreven', async () => {
    const { FreelancerTable } = await import('@/features/freelancers/internal/list/FreelancerTable')
    const html = renderToStaticMarkup(createElement(FreelancerTable, { list: [f], labels: {} }))
    expect(html).toContain('Laatste opdracht')
    expect(html).toContain('>Lopend<')
    expect(html).not.toContain('Lop.<')
  })
})

describe('de componenten gebruiken de fixes (bugs 3–9)', () => {
  const src = (p: string) => readFileSync(path.join(process.cwd(), 'src/features/freelancers/internal', p), 'utf8')
  it.each([
    ['assignments/AssignmentPanel.tsx', /disciplineLabel\(a\.discipline/],
    ['profile/ProfilePage.tsx', /mergeFreelancer\(prev, next\)/],
    ['profile/ProfileOverview.tsx', /onEdit=\{\(\) => setC\(seed\.contact\(f\)\)\}/],
    ['profile/EditableCard.tsx', /onEdit\?\.\(\)/],
    ['profile/ProfileHeader.tsx', /saveStatus\(internalApi\.update/],
    ['assignments/NewAssignmentForm.tsx', /submitAssignment\(/],
    ['assignments/NewAssignmentForm.tsx', /note=\{reveal\.warnings/],
    ['assignments/NewAssignmentForm.tsx', /assignableClients\(/],
  ])('%s', (file, re) => { expect(src(file)).toMatch(re) })
  it('elke profielkaart zet zijn velden terug bij openen', () => {
    expect(src('profile/ProfileOverview.tsx').match(/onEdit=\{/g)).toHaveLength(6)
  })
})
