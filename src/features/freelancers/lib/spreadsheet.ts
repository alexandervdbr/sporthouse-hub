import { parseCsv, toCsv } from './csv'
import { slugify } from './slug'

// Importeren en exporteren in het formaat van de spreadsheet:
//   Naam · Wat? · Nummer · Mailadres · Getest · Prijs · Beoordeling · Portfolio · Notities
//
// Vaste regel: geen enkele cel gaat verloren. Wat niet in een veld past,
// gaat met een waarschuwing naar de notities (met de kolomnaam ervoor).
// Uitzondering op vraag: een prijs die alleen "?" of "-" is, blijft leeg.
// Alles hier is puur: de browser toont er het voorbeeld mee, de server
// valideert daarna elke rij opnieuw (schemas.ts). Er wordt niets opgeslagen
// zonder bevestiging.

export type Status = 'vast' | 'proefopdracht' | 'kandidaat' | 'inactief'
export type Unit = 'uur' | 'dag' | 'project'
export interface Link { label?: string; url: string }
export interface DisciplineRef { key: string; label: string }
export interface Existing {
  id: string; name: string; email: string | null; archived_at: string | null
  disciplines: string[]; portfolio_links: Link[]; notes: string | null
}
/** Minimaal wat de export nodig heeft (dezelfde velden als de lijst-API). */
export interface ExportRow {
  name: string; disciplines: string[]; phone: string | null; email: string | null; status: Status
  rate_amount: number | null; rate_unit: Unit | null; rate_note: string | null
  overall_rating: number | null; portfolio_links: Link[]; notes: string | null
}

export const COLUMNS = ['Naam', 'Wat?', 'Nummer', 'Mailadres', 'Getest', 'Prijs', 'Beoordeling', 'Portfolio', 'Notities'] as const

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── Kolomkoppen ─────────────────────────────────────────────────────────────

type Field = 'name' | 'wat' | 'phone' | 'email' | 'getest' | 'prijs' | 'rating' | 'portfolio' | 'notes'
const HEADER: Record<string, Field> = {
  naam: 'name', name: 'name',
  wat: 'wat', discipline: 'wat', disciplines: 'wat',
  nummer: 'phone', telefoon: 'phone', gsm: 'phone', tel: 'phone', telefoonnummer: 'phone',
  mailadres: 'email', email: 'email', 'e-mail': 'email', mail: 'email', emailadres: 'email', 'e-mailadres': 'email',
  getest: 'getest', status: 'getest',
  prijs: 'prijs', tarief: 'prijs',
  beoordeling: 'rating', score: 'rating', rating: 'rating',
  portfolio: 'portfolio', links: 'portfolio',
  notities: 'notes', notitie: 'notes', opmerkingen: 'notes', notes: 'notes',
}
const headerKey = (h: string) => norm(h).replace(/[?:*]/g, '').trim()

// ── Getest ──────────────────────────────────────────────────────────────────

export const GETEST_EXPORT: Record<Status, string> = { vast: 'ja', proefopdracht: 'weinig', kandidaat: 'nee', inactief: 'inactief' }

/**
 * ja → vast, weinig → proef, nee of leeg → nog niet getest. Een vinkje uit
 * Google Sheets: TRUE → vast, FALSE → nog niet getest. FALSE telt (zoals een
 * lege cel) niet als ingevuld: bij bijwerken zet een leeg vakje een vaste
 * freelancer dus niet terug. Iets anders: nog niet getest, en de tekst gaat
 * naar de notities.
 */
export function parseGetest(cell: string): { status: Status; given: boolean; warning?: string; note?: string } {
  const v = norm(cell)
  if (!v || v === 'false' || v === 'onwaar') return { status: 'kandidaat', given: false }
  if (v === 'nee' || v === 'neen' || v === 'nog niet') return { status: 'kandidaat', given: true }
  if (v === 'ja' || v === 'true' || v === 'waar') return { status: 'vast', given: true }
  if (v === 'weinig') return { status: 'proefopdracht', given: true }
  if (v === 'inactief') return { status: 'inactief', given: true }
  return { status: 'kandidaat', given: false, note: `Getest: ${cell.trim()}`, warning: `Getest "${cell.trim()}" is geen ja, weinig, nee, TRUE of FALSE → Nog niet getest, tekst bij de notities` }
}

// ── Prijs ───────────────────────────────────────────────────────────────────

/** "450", "450,50", "1.200", "1.250,5", "45.5", "1,200" → getal; iets anders → undefined. */
export function parseNumber(s: string): number | undefined {
  let t: string
  if (/^\d+$/.test(s)) t = s
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) t = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) t = s.replace(/,/g, '')
  else if (/^\d+,\d{1,2}$/.test(s)) t = s.replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(s)) t = s
  else return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const UNIT_RE: Record<Unit, RegExp> = {
  uur: /(\/\s*(uur|u|h)\b|\bper\s+(uur|u)\b|\buur(tarief|loon|prijs)?\b|\bp\/u\b|#\s*(u|h)\b)/,
  dag: /(\/\s*(dag|d)\b|\bper\s+dag\b|\bdag(tarief|prijs)?\b|\bp\/d\b|#\s*d\b)/,
  project: /(\/\s*project\b|\bper\s+(project|opdracht)\b|\bproject(prijs)?\b|\bforfait(air)?\b)/,
}

export interface Price { amount: number | null; unit: Unit | null; note: string | null; given: boolean }

/**
 * Bedrag + eenheid als dat ondubbelzinnig is: precies één bedrag en precies
 * één eenheid (uur, dag of project), geen "halve dag". Staat er nog meer
 * tekst bij (bv. "excl. btw"), dan blijft de originele tekst als notitie.
 * Al het andere gaat volledig naar de notitie. "€450/dag — €250 halve dag"
 * (zo exporteren we het zelf) wordt bedrag + eenheid met de rest als notitie.
 */
export function parsePrice(cell: string): Price {
  const s = cell.trim()
  // Leeg, of alleen "?" of "-": niets ingevuld.
  if (!s || /^[?\-–—]+$/.test(s)) return { amount: null, unit: null, note: null, given: false }
  const dash = s.split(/\s+—\s+/)
  if (dash.length === 2) {
    const head = parsePrice(dash[0])
    if (head.amount != null && head.note == null) return { ...head, note: dash[1].trim() || null }
  }
  const asNote: Price = { amount: null, unit: null, note: s, given: true }
  const lower = norm(s)
  const nums = lower.match(/\d[\d.,]*\d|\d/g) ?? []
  if (nums.length !== 1) return asNote
  const amount = parseNumber(nums[0])
  if (amount === undefined) return asNote
  if (/\bhal(f|ve)\b/.test(lower)) return asNote
  const marked = lower.replace(nums[0], ' # ')
  const units = (Object.keys(UNIT_RE) as Unit[]).filter(u => UNIT_RE[u].test(marked))
  if (units.length !== 1) return asNote
  const rest = marked
    .replace(/#/g, ' ').replace(/€|\beuros?\b|\beur\b/g, ' ')
    .replace(/\b(per|uur|u|h|dag|d|project|opdracht|uurtarief|uurloon|uurprijs|dagtarief|dagprijs|projectprijs|forfait|forfaitair|p\/u|p\/d)\b/g, ' ')
    .replace(/[\s/.,:;\-–()]+/g, '')
  return { amount, unit: units[0], note: rest ? s : null, given: true }
}

// ── Beoordeling ─────────────────────────────────────────────────────────────

export interface Rating { value: number | null; links: Link[]; note: string | null; warning?: string }

/**
 * Sterren uit Google Sheets ("★★★☆☆" → 3; "☆☆☆☆☆" → leeg) of een geheel getal
 * van 1 tot 5 ("4", "4/5", "4,0"). Iets anders gaat nooit verloren: links
 * gaan naar het portfolio, de rest naar de notities als "Beoordeling: …".
 */
export function parseRating(cell: string): Rating {
  const s = cell.trim()
  const none: Rating = { value: null, links: [], note: null }
  if (!s) return none
  if (/^[★⭐☆✩\s]+$/.test(s)) {
    const filled = [...s].filter(c => c === '★' || c === '⭐').length
    if (filled === 0) return none
    if (filled <= 5) return { ...none, value: filled }
  }
  const m = s.match(/^([1-5])(?:[.,]0+)?(?:\s*\/\s*5)?$/)
  if (m) return { ...none, value: Number(m[1]) }
  const pf = parsePortfolio(s)
  const parts = [pf.links.length ? `${pf.links.length === 1 ? 'link' : 'links'} → portfolio` : null, pf.rest ? 'tekst → notities' : null].filter(Boolean)
  return {
    value: null, links: pf.links, note: pf.rest ? `Beoordeling: ${pf.rest}` : null,
    warning: `Beoordeling "${s.length > 60 ? `${s.slice(0, 57)}…` : s}" is geen cijfer of sterren → ${parts.join(', ')}`,
  }
}

// ── Wat? ────────────────────────────────────────────────────────────────────

/**
 * Splitsen op komma, dan op slash — maar een bestaand label met een slash
 * ("Foto/Video") blijft heel. Vergelijkt op label of sleutel, zonder
 * hoofdletters of accenten.
 */
/** Andere namen voor een bestaande discipline (sleutel), zoals ze in de spreadsheet staan. */
export const DISCIPLINE_ALIASES: Record<string, string> = {
  'motion designer': 'video-vfx-motion',
  'motion design': 'video-vfx-motion',
}

export function parseWat(cell: string, known: DisciplineRef[]): { keys: string[]; unknown: string[] } {
  const byNorm = new Map<string, string>()
  for (const d of known) { byNorm.set(norm(d.label), d.key); byNorm.set(norm(d.key), d.key) }
  for (const [alias, key] of Object.entries(DISCIPLINE_ALIASES)) if (known.some(d => d.key === key)) byNorm.set(alias, key)
  const keys: string[] = [], unknown: string[] = []
  const add = (part: string) => {
    const p = part.trim().replace(/[?.]+$/, '').trim()
    if (!p) return
    const k = byNorm.get(norm(p))
    if (k) { if (!keys.includes(k)) keys.push(k) }
    else if (!unknown.some(u => norm(u) === norm(p))) unknown.push(p)
  }
  for (const part of cell.split(/[,;\n]/)) {
    if (byNorm.has(norm(part.trim()))) add(part)
    else part.split('/').forEach(add)
  }
  return { keys, unknown }
}

// ── Portfolio en e-mail ─────────────────────────────────────────────────────

/** Elke URL wordt een link (www.… krijgt https://). Tekst zonder link komt terug als rest. */
export function parsePortfolio(cell: string): { links: Link[]; rest: string | null } {
  const found = cell.match(/\bhttps?:\/\/[^\s,;]+|\bwww\.[^\s,;]+/gi) ?? []
  const links: Link[] = []
  for (const raw of found) {
    const url = (raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw).replace(/[).]+$/, '')
    if (!links.some(l => l.url === url)) links.push({ url })
  }
  let rest = cell
  for (const raw of found) rest = rest.replace(raw, ' ')
  // Alleen de links eruit; de rest blijft zoals ze er stond (geen tekst kwijt).
  if (!rest.replace(/[\s,;|]+/g, '')) return { links, rest: null }
  rest = rest.replace(/[ \t]+/g, ' ').replace(/^[\s,;|]+|[\s,;|]+$/g, '').trim()
  return { links, rest }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Een rij en het hele bestand ─────────────────────────────────────────────

export interface Parsed {
  name: string
  disciplines: string[]
  unknown: string[]
  status: Status
  statusGiven: boolean
  phone: string | null
  email: string | null
  price: Price
  overall_rating: number | null
  portfolio_links: Link[]
  notes: string | null
}

export interface Row {
  /** Rijnummer zoals in de spreadsheet (kop = 1). */
  line: number
  data: Parsed
  warnings: string[]
  /** De rij kan niet ingelezen worden (bv. geen naam). */
  error?: string
  /** Bestaat al: op e-mail, anders op naam. */
  match?: { id: string; name: string; by: 'e-mail' | 'naam'; archived: boolean }
  /** Dezelfde persoon staat hoger in het bestand. */
  dupOf?: number
}

export interface Analysis {
  rows: Row[]
  /** Onbekende waarden in Wat?, met de rijen waarin ze staan. */
  proposals: { label: string; lines: number[] }[]
  /** Kolommen die we niet kennen; hun cellen gaan naar de notities. */
  ignoredColumns: string[]
  /** Het bestand zelf is onbruikbaar (bv. geen kolom Naam). */
  error?: string
}

export function analyze(text: string, known: DisciplineRef[], existing: Existing[]): Analysis {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], proposals: [], ignoredColumns: [], error: 'Het bestand is leeg.' }
  const header = table[0].map(headerKey)
  const col: Partial<Record<Field, number>> = {}
  const ignoredColumns: string[] = []
  const otherCols: number[] = []
  header.forEach((h, i) => {
    const f = HEADER[h]
    if (f && col[f] === undefined) col[f] = i
    else { otherCols.push(i); if (h) ignoredColumns.push(table[0][i].trim()) }
  })
  if (col.name === undefined) return { rows: [], proposals: [], ignoredColumns, error: 'Geen kolom "Naam" gevonden. De eerste regel moet de kolomnamen bevatten.' }

  const byEmail = new Map(existing.filter(e => e.email).map(e => [e.email!.toLowerCase(), e]))
  const earlierRows: { line: number; email: string | null; name: string }[] = []
  const proposals = new Map<string, { label: string; lines: number[] }>()

  const rows = table.slice(1).map((cells, i): Row => {
    const line = i + 2
    const get = (f: Field) => (col[f] === undefined ? '' : (cells[col[f]!] ?? '').trim())
    const warnings: string[] = []
    const extra: string[] = []

    const name = get('name').replace(/\s+/g, ' ')
    const wat = parseWat(get('wat'), known)
    const getest = parseGetest(get('getest'))
    if (getest.warning) warnings.push(getest.warning)
    if (getest.note) extra.push(getest.note)
    const price = parsePrice(get('prijs'))
    if (price.given && price.amount == null) warnings.push('Prijs niet eenduidig → volledig als notitie bij het tarief')
    const rating = parseRating(get('rating'))
    if (rating.warning) warnings.push(rating.warning)
    if (rating.note) extra.push(rating.note)
    const pf = parsePortfolio(get('portfolio'))
    if (pf.rest) { warnings.push('Portfolio bevat tekst zonder link → bij de notities'); extra.push(`Portfolio: ${pf.rest}`) }
    const links = [...pf.links, ...rating.links.filter(l => !pf.links.some(p => p.url === l.url))]

    const mails = get('email').split(/[\s,;]+/).map(m => m.trim().toLowerCase()).filter(Boolean)
    const email = mails.find(m => EMAIL.test(m)) ?? null
    const otherMails = mails.filter(m => m !== email)
    if (otherMails.length) { warnings.push(email ? 'Meer dan één e-mailadres → de andere bij de notities' : 'Ongeldig e-mailadres → bij de notities'); extra.push(`E-mail: ${otherMails.join(', ')}`) }
    if (wat.unknown.length) warnings.push(`Onbekend in Wat?: ${wat.unknown.join(', ')}`)
    // Kolommen die we niet kennen (of een tweede kolom voor hetzelfde veld): naar de notities.
    for (const i of otherCols) {
      const v = (cells[i] ?? '').trim()
      if (!v) continue
      const label = table[0][i].trim() || `Kolom ${i + 1}`
      extra.push(`${label}: ${v}`)
      warnings.push(`Kolom "${label}" → bij de notities`)
    }
    for (let i = table[0].length; i < cells.length; i++) {
      const v = (cells[i] ?? '').trim()
      if (v) { extra.push(`Kolom ${i + 1}: ${v}`); warnings.push(`Cel zonder kolomnaam (kolom ${i + 1}) → bij de notities`) }
    }

    const notes = [get('notes'), ...extra].filter(Boolean).join('\n') || null
    const data: Parsed = {
      name, disciplines: wat.keys, unknown: wat.unknown, status: getest.status, statusGiven: getest.given,
      phone: get('phone').replace(/\s+/g, ' ') || null, email, price, overall_rating: rating.value,
      portfolio_links: links, notes,
    }
    for (const u of wat.unknown) {
      const k = norm(u)
      if (!proposals.has(k)) proposals.set(k, { label: u, lines: [] })
      proposals.get(k)!.lines.push(line)
    }

    if (!name) return { line, data, warnings, error: 'Geen naam' }
    const row: Row = { line, data, warnings }
    // Dezelfde persoon: hetzelfde e-mailadres, of dezelfde naam zolang de
    // e-mailadressen elkaar niet tegenspreken.
    const earlier = earlierRows.find(e => (email && e.email === email) || (e.name === norm(name) && !(email && e.email && e.email !== email)))
    if (earlier) row.dupOf = earlier.line
    else earlierRows.push({ line, email, name: norm(name) })
    const m = (email && byEmail.get(email))
      || existing.find(e => norm(e.name) === norm(name) && !(email && e.email && e.email.toLowerCase() !== email))
    if (m) row.match = { id: m.id, name: m.name, by: email && m.email?.toLowerCase() === email ? 'e-mail' : 'naam', archived: !!m.archived_at }
    return row
  })
  return { rows, proposals: [...proposals.values()], ignoredColumns }
}

// ── Van voorbeeld naar opslaan ──────────────────────────────────────────────

export type Decision = 'overslaan' | 'bijwerken'

export interface Plan {
  newDisciplines: { key: string; label: string }[]
  create: { line: number; data: Record<string, unknown> }[]
  update: { line: number; id: string; data: Record<string, unknown> }[]
  skipped: { line: number; reason: string }[]
}

const uniq = <T,>(a: T[], key: (x: T) => string) => a.filter((x, i) => a.findIndex(y => key(y) === key(x)) === i)

/** Wat er van een rij wordt opgeslagen, gegeven de gekozen nieuwe disciplines. Leeg = null (bij bijwerken: weggelaten). */
function finalDisciplines(d: Parsed, accepted: Set<string>): { keys: string[]; dropped: string[] } {
  const keys = [...d.disciplines]
  const dropped: string[] = []
  for (const u of d.unknown) {
    if (accepted.has(norm(u))) { const k = slugify(u); if (k && !keys.includes(k)) keys.push(k) }
    else dropped.push(u)
  }
  return { keys, dropped }
}

/**
 * Het plan dat naar de server gaat. Nieuw: alle velden. Bijwerken: alleen
 * wat in het bestand ingevuld is (lege cellen overschrijven niets); Wat?,
 * portfolio en notities worden samengevoegd met wat er al staat.
 */
export function buildPlan(a: Analysis, decisions: Record<number, Decision>, acceptedLabels: string[], existing: Existing[]): Plan {
  const accepted = new Set(acceptedLabels.map(norm))
  const plan: Plan = { newDisciplines: [], create: [], update: [], skipped: [] }
  plan.newDisciplines = uniq(a.proposals.filter(p => accepted.has(norm(p.label))).map(p => ({ key: slugify(p.label), label: p.label.trim() })).filter(d => d.key), d => d.key)
  const byId = new Map(existing.map(e => [e.id, e]))

  for (const r of a.rows) {
    if (r.error) { plan.skipped.push({ line: r.line, reason: r.error }); continue }
    if (r.dupOf) { plan.skipped.push({ line: r.line, reason: `Dubbel in het bestand (zie rij ${r.dupOf})` }); continue }
    const d = r.data
    const { keys, dropped } = finalDisciplines(d, accepted)
    const notes = [d.notes, dropped.length ? `Wat?: ${dropped.join(', ')}` : null].filter(Boolean).join('\n') || null

    if (r.match) {
      if ((decisions[r.line] ?? 'overslaan') === 'overslaan') { plan.skipped.push({ line: r.line, reason: `Bestaat al (${r.match.by})` }); continue }
      const cur = byId.get(r.match.id)
      const patch: Record<string, unknown> = { name: d.name }
      if (keys.length) patch.disciplines = [...new Set([...(cur?.disciplines ?? []), ...keys])]
      if (d.statusGiven) patch.status = d.status
      if (d.phone) patch.phone = d.phone
      if (d.email) patch.email = d.email
      if (d.price.given) { patch.rate_amount = d.price.amount; patch.rate_unit = d.price.unit; patch.rate_note = d.price.note }
      if (d.overall_rating != null) patch.overall_rating = d.overall_rating
      if (d.portfolio_links.length) patch.portfolio_links = uniq([...(cur?.portfolio_links ?? []), ...d.portfolio_links], l => l.url).slice(0, 20)
      if (notes && !(cur?.notes ?? '').includes(notes)) patch.notes = [cur?.notes, notes].filter(Boolean).join('\n\n')
      plan.update.push({ line: r.line, id: r.match.id, data: patch })
      continue
    }

    if (!keys.length) { plan.skipped.push({ line: r.line, reason: 'Geen Wat? (minstens één discipline nodig)' }); continue }
    plan.create.push({
      line: r.line,
      data: {
        name: d.name, disciplines: keys, status: d.status, phone: d.phone, email: d.email,
        rate_amount: d.price.amount, rate_unit: d.price.unit, rate_note: d.price.note,
        overall_rating: d.overall_rating, portfolio_links: d.portfolio_links, notes,
      },
    })
  }
  return plan
}

// ── Exporteren ──────────────────────────────────────────────────────────────

const eur = (n: number) => `€${n.toLocaleString('nl-BE', { maximumFractionDigits: 2 })}`

/** De prijs zoals in de spreadsheet; importeren leest ze terug. */
export function priceText(f: Pick<ExportRow, 'rate_amount' | 'rate_unit' | 'rate_note'>): string {
  const base = f.rate_amount != null && f.rate_unit ? `${eur(f.rate_amount)}/${f.rate_unit}` : ''
  if (!base) return f.rate_note ?? ''
  if (!f.rate_note || f.rate_note === base) return base
  // Een notitie die zelf al het bedrag bevatte (bv. "€450/dag excl. btw") staat er los.
  return parsePrice(f.rate_note).amount === f.rate_amount ? f.rate_note : `${base} — ${f.rate_note}`
}

export function exportCsv(list: ExportRow[], labels: Record<string, string>): string {
  return toCsv([
    [...COLUMNS],
    ...list.map(f => [
      f.name,
      f.disciplines.map(k => labels[k] ?? k).join(', '),
      f.phone,
      f.email,
      GETEST_EXPORT[f.status],
      priceText(f),
      f.overall_rating,
      f.portfolio_links.map(l => l.url).join(' '),
      f.notes,
    ]),
  ])
}
