// Import van logins voor Wachtwoorden, uit een CSV-bestand of uit rijen die
// rechtstreeks uit Google Sheets / Excel geplakt zijn.
//
// Alles hier draait in de browser. De ruwe tabel gaat nergens naartoe: de
// pagina roept per rij gewoon upsert_credential() aan, dezelfde route als
// handmatig toevoegen (versleuteling en rechten in de database).
//
// Geen server-only imports en geen logging van inhoud — dit zijn wachtwoorden.

export type LoginMethod = 'password' | 'google'

export interface ImportRow {
  // Regelnummer in de bron (1 = eerste regel), zodat een fout terug te vinden is.
  line: number
  platform: string
  url: string
  username: string
  password: string
  notes: string
  login_method: LoginMethod
  // Waarom deze rij niet geïmporteerd kan worden, of null.
  issue: string | null
  // De cellen zoals ze in de bron stonden, om de methode per rij te kunnen
  // omzetten zonder iets te verliezen.
  raw: RawCells
}

export interface RawCells {
  platform: string
  url: string
  username: string
  password: string
  notes: string
}

type Field = keyof RawCells

// ─── Tabel lezen ─────────────────────────────────────────────────────────────

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (firstLine.includes('\t')) return '\t'
  const semi = firstLine.split(';').length
  const comma = firstLine.split(',').length
  return semi > comma ? ';' : ','
}

// CSV/TSV met aanhalingstekens ("a, b" en "" als escape) en regeleinden
// binnen aanhalingstekens — zo exporteren Sheets en Excel het.
export function parseTable(text: string): string[][] {
  const delim = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else quoted = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell === '') { quoted = true; continue }
    if (ch === delim) { row.push(cell); cell = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row)
      row = []; cell = ''
      continue
    }
    cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }

  return rows.filter(r => r.some(c => c.trim() !== ''))
}

// ─── Kolommen herkennen ──────────────────────────────────────────────────────

const HEADER_NAMES: Record<Field, string[]> = {
  platform: ['platform', 'naam', 'name', 'account', 'dienst', 'tool'],
  username: ['login', 'gebruikersnaam', 'gebruiker', 'username', 'user', 'e-mail', 'email', 'mail'],
  password: ['wachtwoord', 'paswoord', 'password', 'pass', 'pw', 'ww'],
  url: ['url', 'website', 'link', 'site'],
  notes: ['notitie', 'notities', 'notes', 'opmerking', 'opmerkingen', 'info'],
}

function headerField(cell: string): Field | null {
  const name = cell.trim().toLowerCase()
  for (const field of Object.keys(HEADER_NAMES) as Field[]) {
    if (HEADER_NAMES[field].includes(name)) return field
  }
  return null
}

export interface ColumnMap {
  hasHeader: boolean
  columns: Partial<Record<Field, number>>
}

// Met kopregel: kolommen op naam; een platformkolom zonder naam (zoals bij
// ons, waar de eerste kolom leeg is bovenaan) is dan de eerste kolom.
// Zonder kopregel: platform, login, wachtwoord op volgorde.
export function detectColumns(rows: string[][]): ColumnMap {
  const first = rows[0] ?? []
  const columns: Partial<Record<Field, number>> = {}
  first.forEach((cell, i) => {
    const field = headerField(cell)
    if (field && columns[field] === undefined) columns[field] = i
  })

  const hasHeader = columns.username !== undefined || columns.password !== undefined
  if (!hasHeader) return { hasHeader: false, columns: { platform: 0, username: 1, password: 2 } }

  if (columns.platform === undefined) {
    const used = new Set(Object.values(columns))
    const free = first.findIndex((_, i) => !used.has(i))
    if (free !== -1) columns.platform = free
  }
  return { hasHeader, columns }
}

// ─── Rijen opbouwen ──────────────────────────────────────────────────────────

const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/i

export function mentionsGoogle(raw: RawCells): boolean {
  return /google/i.test(raw.password) || /google/i.test(raw.username)
}

export function buildImportRow(raw: RawCells, line: number, method: LoginMethod = mentionsGoogle(raw) ? 'google' : 'password'): ImportRow {
  let username = raw.username
  let password = raw.password
  let notes = raw.notes

  if (method === 'google') {
    // In de spreadsheet staat bij Google-logins vrije tekst ("inloggen met
    // het Google-account x@y.be"). Het adres wordt de login, de tekst blijft
    // bewaard als notitie, zodat er niets verloren gaat.
    const email = [raw.username, raw.password, raw.notes].map(c => c.match(EMAIL)?.[0]).find(Boolean)
    if (email) username = email
    const text = [raw.username, raw.password]
      .map(c => c.trim())
      .filter(c => c !== '' && c !== username)
    notes = [raw.notes.trim(), ...text].filter(Boolean).join(' — ')
    password = ''
  }

  const row: ImportRow = {
    line,
    platform: raw.platform.trim(),
    url: raw.url.trim(),
    username: username.trim(),
    password,
    notes: notes.trim(),
    login_method: method,
    issue: null,
    raw,
  }

  if (!row.platform) row.issue = 'Platform ontbreekt'
  else if (!row.username) row.issue = method === 'google' ? 'Google-account ontbreekt' : 'Login ontbreekt'
  else if (method === 'password' && !row.password) row.issue = 'Wachtwoord ontbreekt'

  return row
}

export function parseImport(text: string): ImportRow[] {
  const rows = parseTable(text)
  const { hasHeader, columns } = detectColumns(rows)
  const cell = (r: string[], f: Field) => (columns[f] !== undefined ? r[columns[f]!] ?? '' : '')

  return rows.slice(hasHeader ? 1 : 0).map((r, i) => buildImportRow({
    platform: cell(r, 'platform'),
    url: cell(r, 'url'),
    username: cell(r, 'username'),
    password: cell(r, 'password'),
    notes: cell(r, 'notes'),
  }, i + (hasHeader ? 2 : 1)))
}

// Zelfde platform + login = dezelfde login (hoofdletters en spaties tellen niet).
export function credentialKey(platform: string, username: string): string {
  return `${platform.trim().toLowerCase()}\u0000${username.trim().toLowerCase()}`
}
