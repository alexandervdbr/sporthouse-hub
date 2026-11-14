import type { AssignmentRow, Freelancer } from '../types'
import { reviewOf } from '../types'

// Filteren, sorteren en groeperen — puur, zodat het los te testen is.
// De waarden komen uit de URL (?q=&status=&d=&nu=1&sort=).

export type StatusFilter = Freelancer['status'] | 'alle'
export type SortKey = 'beoordeling' | 'laatste' | 'tarief'
export const DEFAULT_STATUSES: Freelancer['status'][] = ['vast', 'proefopdracht']

export interface ListFilters { q: string; statuses: Freelancer['status'][] | 'alle'; disciplines: string[]; nowAvailable: boolean; sort: SortKey }

export function filtersFromParams(p: URLSearchParams): ListFilters {
  const status = p.get('status')
  const statuses = status === 'alle' ? 'alle'
    : status ? status.split(',').filter((s): s is Freelancer['status'] => ['vast', 'proefopdracht', 'kandidaat', 'inactief'].includes(s))
    : DEFAULT_STATUSES
  const sort = p.get('sort')
  return {
    q: p.get('q') ?? '',
    statuses: Array.isArray(statuses) && statuses.length === 0 ? DEFAULT_STATUSES : statuses,
    disciplines: (p.get('d') ?? '').split(',').filter(Boolean),
    nowAvailable: p.get('nu') === '1',
    sort: sort === 'laatste' || sort === 'tarief' ? sort : 'beoordeling',
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Zoeken op naam, discipline (label) en notities. */
export function matchesSearch(f: Freelancer, q: string, labels: Record<string, string>): boolean {
  if (!q.trim()) return true
  const hay = norm([f.name, f.notes ?? '', ...f.disciplines.map(d => labels[d] ?? d)].join(' '))
  return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

export function isAvailableNow(f: Freelancer, today: string): boolean {
  if (f.availability === 'beschikbaar') return true
  return !!f.available_from && f.available_from <= today
}

export function applyFilters(list: Freelancer[], fl: ListFilters, labels: Record<string, string>, today: string): Freelancer[] {
  return list.filter(f =>
    (fl.statuses === 'alle' || fl.statuses.includes(f.status))
    && (fl.disciplines.length === 0 || fl.disciplines.some(d => f.disciplines.includes(d)))
    && (!fl.nowAvailable || isAvailableNow(f, today))
    && matchesSearch(f, fl.q, labels))
}

/** Standaard: totaalbeoordeling, dan het gemiddelde van de reviews; ontbrekend achteraan. */
export function sortFreelancers(list: Freelancer[], sort: SortKey): Freelancer[] {
  const by = {
    beoordeling: (f: Freelancer) => [f.overall_rating ?? -1, f.stats?.review_avg ?? -1],
    laatste: (f: Freelancer) => [f.stats?.last_assignment_at ? Date.parse(f.stats.last_assignment_at) : -1, 0],
    tarief: (f: Freelancer) => [f.rate_amount != null ? -f.rate_amount : -Infinity, 0],
  }[sort]
  return [...list].sort((a, b) => {
    const [a1, a2] = by(a), [b1, b2] = by(b)
    return b1 - a1 || b2 - a2 || a.name.localeCompare(b.name, 'nl')
  })
}

export function statusCounts(list: Freelancer[]) {
  const c = { vast: 0, proefopdracht: 0, kandidaat: 0, inactief: 0, alle: list.length }
  for (const f of list) c[f.status]++
  return c
}

// ── Opdrachten over alle freelancers heen ───────────────────────────────────

export type GroupKey = 'wacht' | 'gedeeld' | 'lopend' | 'concepten' | 'recent'
export const GROUPS: { key: GroupKey; title: string; hint: string }[] = [
  { key: 'wacht', title: 'Wacht op ons', hint: 'Opgeleverd (afronden of terugsturen), of afgerond zonder review' },
  { key: 'gedeeld', title: 'Gedeeld', hint: 'Wacht op de freelancer' },
  { key: 'lopend', title: 'Lopend', hint: '' },
  { key: 'concepten', title: 'Concepten', hint: '' },
  { key: 'recent', title: 'Recent afgerond', hint: 'De laatste 30 dagen' },
]

export function groupOf(a: AssignmentRow, now = Date.now()): GroupKey | null {
  if (a.is_historical) return null
  switch (a.status) {
    case 'opgeleverd': return 'wacht'
    case 'afgerond': return reviewOf(a) ? (now - Date.parse(a.status_changed_at) < 30 * 86400_000 ? 'recent' : null) : 'wacht'
    case 'gedeeld': return 'gedeeld'
    case 'geaccepteerd': return 'lopend'
    case 'concept': return 'concepten'
    case 'geweigerd': case 'geannuleerd': return now - Date.parse(a.status_changed_at) < 30 * 86400_000 ? 'recent' : null
    default: return null
  }
}
