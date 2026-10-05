// A copy of the months you've already looked at, kept in the browser.
//
// Opening a month used to cost a full fetch of every row in it, and you got a
// loading state while it ran, every single time, including for a month you'd
// looked at a minute earlier. Walking a few weeks forward and back through
// March paid that bill on each step.
//
// With a cached copy the grid paints from localStorage before anything leaves
// the browser, and the network is only asked the much smaller question of what
// changed since. See syncMonth in PlanningApp for how that question stays
// exact rather than approximate.
//
// Nothing here is authoritative: a miss, a parse failure or a cleared store
// simply falls back to the full fetch that used to be the only path.

// The shape SELECT_COLS brings back. Named so the full load, the incremental
// sync and the cache can't drift apart on what they expect.
export interface PlanningRow {
  year: number
  month: number
  day: number
  department: string
  employee: string
  value: string
  bold: boolean | null
  text_color: string | null
  bg_color: string | null
  note: string | null
  updated_by: string | null
  updated_at: string | null
}

export const SELECT_COLS =
  'year, month, day, department, employee, value, bold, text_color, bg_color, note, updated_by, updated_at'

export interface CachedMonth {
  rows: PlanningRow[]
  // The newest updated_at among those rows: where the next sync starts asking.
  lastSeen: string
  // Wall-clock of the write, used only to decide what to evict first.
  savedAt: number
}

// Bumped if PlanningRow or the key format ever changes, so an old copy is
// ignored instead of being read as if it still matched.
const CACHE_KEY = 'planning-month-cache-v1'

// Wie je bent in het rooster, en onder welk account die keuze gemaakt is.
// Die tweede sleutel bestaat omdat de keuze zelf een bewuste handeling is
// ("Niet jij? Wissel van naam") en dus niet zomaar overschreven mag worden —
// maar wél moet verdwijnen zodra er iemand anders inlogt op dit toestel.
export const IDENTITY_KEY = 'planning-my-name'
export const IDENTITY_ACCOUNT_KEY = 'planning-my-name-account'

// De laatst gelukte afdelingenconfig: het hele rooster, met alle namen erin.
export const CONFIG_CACHE_KEY = 'planning-config-cache'

// A busy month is about 200 kB of JSON and localStorage gives roughly 5 MB,
// most of which belongs to other parts of the app. Four is enough to cover
// moving back and forth between neighbouring months, which is what people
// actually do, without crowding anything else out.
const KEEP_MONTHS = 4

// Past this, re-fetch in full rather than sync. The sync itself stays correct
// over any gap, but a month nobody has opened in a week is not worth the
// bookkeeping, and this keeps a forgotten copy from living in a browser
// indefinitely.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type Store = Record<string, CachedMonth>

export function monthCacheKey(year: number, month: number) {
  return `${year}-${month}`
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Store
  } catch {
    // Private browsing, or a copy written by an older version of this file.
    return {}
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    // Out of quota, most likely. Everything but the newest month goes, which
    // is the entry the caller just wrote and the one they're looking at.
    const newest = Object.entries(store).sort((a, b) => b[1].savedAt - a[1].savedAt)[0]
    try {
      localStorage.setItem(CACHE_KEY, newest ? JSON.stringify({ [newest[0]]: newest[1] }) : '{}')
    } catch {
      // Not writable at all. The app works without this.
    }
  }
}

export function readCachedMonth(year: number, month: number): CachedMonth | null {
  const entry = readStore()[monthCacheKey(year, month)]
  if (!entry || !Array.isArray(entry.rows) || typeof entry.lastSeen !== 'string') return null
  if (Date.now() - (entry.savedAt ?? 0) > MAX_AGE_MS) return null
  return entry
}

export function writeCachedMonth(year: number, month: number, rows: PlanningRow[], lastSeen: string) {
  const store = readStore()
  store[monthCacheKey(year, month)] = { rows, lastSeen, savedAt: Date.now() }

  const fresh = Object.entries(store)
    .filter(([, m]) => Date.now() - (m.savedAt ?? 0) <= MAX_AGE_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, KEEP_MONTHS)

  writeStore(Object.fromEntries(fresh))
}

// Planning is internal business data and localStorage outlives a session, so
// signing out takes the copy with it — otherwise the next person on a shared
// laptop could read last month's roster out of the browser without ever
// logging in. Called from the logout handler in Sidebar.
//
// Dat gold maar voor de maandcache. De gekozen identiteit en de afdelingen-
// config bleven staan, en dat is precies hetzelfde probleem: wie daarna
// inlogde zag (en bewerkte) de "Mijn maand" van de vorige persoon, en het
// volledige rooster stond nog in de browser. Die gaan nu mee.
//
// Wat blijft staan: planning-active-tab, planning-team-view-mode en
// planning-sections:<identiteit>. Dat zijn weergavevoorkeuren zonder
// planningsgegevens, en de sectievoorkeuren hangen al aan een identiteit —
// iemand anders leest ze dus niet, en jij verliest ze niet bij elke logout.
export function clearPlanningCache() {
  for (const key of [CACHE_KEY, IDENTITY_KEY, IDENTITY_ACCOUNT_KEY, CONFIG_CACHE_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Niet beschikbaar (private browsing) — dan staat er ook niets.
    }
  }
}

// Alleen de maandkopie, zonder de identiteit of de config aan te raken. Nodig
// nadat cellen van naam veranderd zijn (zie /api/planning/rename): de kopie in
// de browser staat dan nog op de oude namen, maar wie je bent is ongewijzigd.
export function clearPlanningMonthCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Niet beschikbaar (private browsing) — dan staat er ook niets.
  }
}
