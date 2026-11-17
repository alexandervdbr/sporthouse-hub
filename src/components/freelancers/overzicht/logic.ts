import type { Freelancer, FStatus, PortfolioLink, RateUnit } from './types'

// Filteren, sorteren en weergeven — puur, zodat het los te testen is.
// Alles wat de lijst bepaalt staat in de URL:
//   ?q=…&wat=video,foto&status=vast,proefopdracht&archief=1&sort=naam&dir=asc&id=…

export const STATUSES: FStatus[] = ['vast', 'proefopdracht', 'kandidaat', 'inactief']
export const STATUS_LABEL: Record<FStatus, string> = {
  vast: 'Vast', proefopdracht: 'Proef', kandidaat: 'Nog niet getest', inactief: 'Inactief',
}
export const RATE_UNIT_LABEL: Record<RateUnit, string> = { uur: 'uur', dag: 'dag', project: 'project' }

export type SortKey = 'naam' | 'wat' | 'status' | 'beoordeling' | 'tarief'
export type Dir = 'asc' | 'desc'
const SORT_KEYS: SortKey[] = ['naam', 'wat', 'status', 'beoordeling', 'tarief']
/** De richting als je voor het eerst op een kolom klikt: tekst A→Z, cijfers hoog→laag. */
export const FIRST_DIR: Record<SortKey, Dir> = { naam: 'asc', wat: 'asc', status: 'asc', beoordeling: 'desc', tarief: 'desc' }

export interface ListFilters {
  q: string
  wat: string[]
  /** Leeg = alle statussen. */
  statuses: FStatus[]
  archief: boolean
  sort: SortKey
  dir: Dir
}

export const DEFAULT_FILTERS: ListFilters = { q: '', wat: [], statuses: [], archief: false, sort: 'naam', dir: 'asc' }

const csv = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function filtersFromParams(p: URLSearchParams): ListFilters {
  const sort = p.get('sort') as SortKey | null
  const s: SortKey = sort && SORT_KEYS.includes(sort) ? sort : 'naam'
  const dir = p.get('dir')
  return {
    q: p.get('q') ?? '',
    wat: csv(p.get('wat')),
    statuses: csv(p.get('status')).filter((x): x is FStatus => (STATUSES as string[]).includes(x)),
    archief: p.get('archief') === '1',
    sort: s,
    dir: dir === 'asc' || dir === 'desc' ? dir : FIRST_DIR[s],
  }
}

/** Het stukje URL voor deze filters; standaardwaarden vallen weg (null). */
export function filtersToParams(f: ListFilters): Record<string, string | null> {
  return {
    q: f.q || null,
    wat: f.wat.length ? f.wat.join(',') : null,
    status: f.statuses.length ? f.statuses.join(',') : null,
    archief: f.archief ? '1' : null,
    sort: f.sort === 'naam' ? null : f.sort,
    dir: f.dir === FIRST_DIR[f.sort] ? null : f.dir,
  }
}

/** Klik op een kolomkop: dezelfde kolom keert om, een andere begint in zijn eigen richting. */
export function nextSort(cur: Pick<ListFilters, 'sort' | 'dir'>, key: SortKey): Pick<ListFilters, 'sort' | 'dir'> {
  if (cur.sort === key) return { sort: key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
  return { sort: key, dir: FIRST_DIR[key] }
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Zoeken op naam, discipline en notities — zonder hoofdletters of accenten; elk woord moet ergens voorkomen. */
export function matchesSearch(f: Freelancer, q: string, labels: Record<string, string>): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm([f.name, f.notes ?? '', ...f.disciplines.map(d => labels[d] ?? d)].join(' '))
  return words.every(w => hay.includes(w))
}

export function applyFilters(list: Freelancer[], fl: ListFilters, labels: Record<string, string>): Freelancer[] {
  return list.filter(f =>
    (fl.archief || !f.archived_at)
    && (fl.statuses.length === 0 || fl.statuses.includes(f.status))
    && (fl.wat.length === 0 || fl.wat.some(d => f.disciplines.includes(d)))
    && matchesSearch(f, fl.q, labels))
}

const UNIT_ORDER: Record<RateUnit, number> = { uur: 0, dag: 1, project: 2 }

/** Sorteren; wie geen waarde heeft staat altijd achteraan, in beide richtingen. Gelijke waarden: op naam. */
export function sortFreelancers(list: Freelancer[], sort: SortKey, dir: Dir, labels: Record<string, string>): Freelancer[] {
  const byName = (a: Freelancer, b: Freelancer) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })
  const key = (f: Freelancer): (string | number)[] | null => {
    switch (sort) {
      case 'naam': return [norm(f.name)]
      case 'wat': return f.disciplines.length ? [norm(f.disciplines.map(d => labels[d] ?? d).sort((a, b) => a.localeCompare(b, 'nl')).join(' '))] : null
      case 'status': return [STATUSES.indexOf(f.status)]
      case 'beoordeling': return f.overall_rating == null && f.collab.avg == null ? null : [f.overall_rating ?? -1, f.collab.avg ?? -1]
      case 'tarief': return f.rate_amount == null || !f.rate_unit ? null : [UNIT_ORDER[f.rate_unit], f.rate_amount]
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b)
    if (!ka || !kb) return ka ? -1 : kb ? 1 : byName(a, b)
    for (let i = 0; i < ka.length; i++) {
      const x = ka[i], y = kb[i]
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl')
      // Tarief: de eenheid groepeert altijd oplopend (uur, dag, project); de richting geldt voor het bedrag.
      if (c) return sort === 'tarief' && i === 0 ? c : c * sign
    }
    return byName(a, b)
  })
}

const eur = (n: number) => `€${n.toLocaleString('nl-BE', { maximumFractionDigits: 2 })}`

/** "€450/dag", anders de vrije tekst, anders null. */
export function rateText(f: Pick<Freelancer, 'rate_amount' | 'rate_unit' | 'rate_note'>): string | null {
  if (f.rate_amount != null && f.rate_unit) return `${eur(f.rate_amount)}/${RATE_UNIT_LABEL[f.rate_unit]}`
  return f.rate_note?.trim() || null
}

export const score = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

/** "★ 4 · samenwerkingen 4,3 (5)". Het gemiddelde staat ernaast, nooit in de plaats. */
export function ratingText(f: Pick<Freelancer, 'overall_rating' | 'collab'>): string | null {
  const parts: string[] = []
  if (f.overall_rating != null) parts.push(`★ ${f.overall_rating}`)
  if (f.collab.avg != null) parts.push(`samenwerkingen ${score(f.collab.avg)} (${f.collab.scored})`)
  return parts.length ? parts.join(' · ') : null
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const mailHref = (email: string) => `mailto:${email}`
/** Wat "kopiëren" kopieert: het e-mailadres, of anders het nummer. */
export const copyValue = (f: Pick<Freelancer, 'email' | 'phone'>) => f.email || f.phone || null

/** Domeinnaam als label voor een link zonder label. */
export function linkLabel(l: PortfolioLink): string {
  if (l.label) return l.label
  try { return new URL(l.url).hostname.replace(/^www\./, '') } catch { return l.url }
}

// ── Het formulier van het paneel ────────────────────────────────────────────

export interface Form {
  name: string
  disciplines: string[]
  status: FStatus
  phone: string
  email: string
  rate_amount: string
  rate_unit: RateUnit | ''
  rate_note: string
  overall_rating: number | null
  overall_rating_note: string
  portfolio_links: { label: string; url: string }[]
  notes: string
}

export function seedForm(f?: Freelancer | null): Form {
  return {
    name: f?.name ?? '',
    disciplines: f?.disciplines ?? [],
    status: f?.status ?? 'kandidaat',
    phone: f?.phone ?? '',
    email: f?.email ?? '',
    rate_amount: f?.rate_amount != null ? String(f.rate_amount).replace('.', ',') : '',
    rate_unit: f?.rate_unit ?? '',
    rate_note: f?.rate_note ?? '',
    overall_rating: f?.overall_rating ?? null,
    overall_rating_note: f?.overall_rating_note ?? '',
    portfolio_links: (f?.portfolio_links ?? []).map(l => ({ label: l.label ?? '', url: l.url })),
    notes: f?.notes ?? '',
  }
}

export type FormErrors = Partial<Record<'name' | 'disciplines' | 'email' | 'rate' | 'portfolio', string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/\S+$/i

/** Bedrag zoals een mens het typt: "450", "450,50", "1.200" of "€ 450". */
export function parseAmount(s: string): number | null | undefined {
  const t = s.replace(/[€\s]/g, '')
  if (!t) return null
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/[.,](?=\d{3}(\D|$))/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Controle in de browser (de server controleert opnieuw), en de body voor de API. */
export function formToBody(form: Form): { errors: FormErrors; body: Record<string, unknown> | null } {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = 'Geef een naam.'
  if (!form.disciplines.length) errors.disciplines = 'Kies minstens één discipline.'
  const email = form.email.trim().toLowerCase()
  if (email && !EMAIL.test(email)) errors.email = 'Dit is geen geldig e-mailadres.'
  const amount = parseAmount(form.rate_amount)
  if (amount === undefined) errors.rate = 'Geef een geldig bedrag.'
  else if ((amount == null) !== (form.rate_unit === '')) errors.rate = 'Geef een bedrag én een eenheid, of geen van beide.'
  const links = form.portfolio_links.filter(l => l.url.trim() || l.label.trim())
  if (links.some(l => !URL_RE.test(l.url.trim()))) errors.portfolio = 'Een link begint met http:// of https://.'
  if (Object.keys(errors).length) return { errors, body: null }
  return {
    errors,
    body: {
      name: form.name.trim(),
      disciplines: form.disciplines,
      status: form.status,
      phone: form.phone.trim() || null,
      email: email || null,
      rate_amount: amount ?? null,
      rate_unit: form.rate_unit || null,
      rate_note: form.rate_note.trim() || null,
      overall_rating: form.overall_rating,
      overall_rating_note: form.overall_rating_note.trim() || null,
      portfolio_links: links.map(l => (l.label.trim() ? { label: l.label.trim(), url: l.url.trim() } : { url: l.url.trim() })),
      notes: form.notes.trim() || null,
    },
  }
}
