'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Settings, Search, TriangleAlert, X, Users } from 'lucide-react'
import {
  DEPARTMENTS, DUTCH_MONTHS, UNASSIGNED_DEPT, normName, personKey, parsePersonKey, type Department,
} from '@/lib/planning-config'
import {
  addMonths, addWeeks, dateCellKey, getMonthWeeks, getWeekDates, groupWeekByMonth, weekDayCellKey, weekLabel,
  type CellData, type PlanningWeekData, type WeekDay,
} from '@/lib/planning-week'
import { isAdminUser } from '@/lib/auth-permissions'
import {
  monthCacheKey, readCachedMonth, writeCachedMonth, clearPlanningMonthCache, SELECT_COLS,
  CONFIG_CACHE_KEY, IDENTITY_KEY, IDENTITY_ACCOUNT_KEY, type PlanningRow,
} from '@/lib/planning-cache'
import { fetchAllRows } from '@/lib/planning-paginate'
import type { PlanningRename, RenameResponse } from '@/lib/planning-rename'
import type { PlanningPreset } from '@/lib/planning-presets'
import PlanningConfigModal from './PlanningConfigModal'
import NamePicker from './NamePicker'
import MiniCalendarPicker from './MiniCalendarPicker'
import WeekGrid, { type Person } from './WeekGrid'
import MyMonthCalendar from './MyMonthCalendar'
import MyMonthWeeks from './MyMonthWeeks'
import TeamMonthGrid from './TeamMonthGrid'
import MobileTeamDayStepper from './MobileTeamDayStepper'
import PlanningStats from './PlanningStats'

const norm = normName

type Tab = 'mijn' | 'team' | 'stats'
type TeamViewMode = 'week' | 'month'

// How often the background poll brings every visible month up to date, and —
// the same number on purpose — how recently a month must have been synced for
// navigating back to it to cost nothing at all.
//
// Measured rather than assumed: Supabase gzips its responses, so a full month
// is about 10 kB on the wire, not the 194 kB of raw JSON. A sync saves most of
// those bytes but costs two requests where a full fetch costs one — and it is
// the number of requests the log quota counts, the one we were furthest over.
// So a month synced within the last interval is served from the cached copy
// and nothing is asked at all.
//
// One number rather than two, because a shorter threshold would buy nothing:
// what's on screen is already allowed to be an interval behind, so re-asking
// sooner than the poll does only adds requests without making anything
// fresher. The live socket is what keeps editing feel immediate; this is the
// ceiling on how stale things may get if that socket dies.
const POLL_INTERVAL = 60000

// Known, confirmed overrides for first names shared by more than one real
// Team contact — see the reconciliation effect below for how this is used.
const AMBIGUOUS_FIRST_NAME_OVERRIDES: Record<string, { surnamePrefix: string; dept: string }[]> = {
  jelle: [
    { surnamePrefix: 'v', dept: 'Team PS' },          // Jelle Vlemincx(...)
    { surnamePrefix: 'd', dept: 'Sport Vl' },         // Jelle Desterbecq
  ],
  thijs: [
    { surnamePrefix: 'm', dept: 'Projectkant SHG' },  // Thijs Meusen
    { surnamePrefix: 'g', dept: 'FOS' },              // Thijs Goemand(s)
  ],
}

// Wat effect 2 hieronder voorstelt: welke kale voornamen hun echte Team-naam
// zouden krijgen, welke namen erbij komen, en hoe het rooster er daarna
// uitziet. Pas als iemand het toepast gaat het naar /api/planning/rename.
interface RosterProposal {
  renames: PlanningRename[]
  additions: { dept: string; emp: string }[]
  departments: Department[]
}

function sameProposal(a: RosterProposal | null, b: RosterProposal | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const key = (p: RosterProposal) => JSON.stringify([
    p.renames.map(r => [r.fromDept, r.fromEmp, r.toDept, r.toEmp]),
    p.additions.map(x => [x.dept, x.emp]),
  ])
  return key(a) === key(b)
}

// The department config always used to start life as the hardcoded
// DEPARTMENTS fallback and only get replaced once /api/planning/config
// resolved — for a returning person whose real identity lives only in the
// synced config (not that old hardcoded list), myPerson couldn't resolve
// until that fetch finished, so "Mijn week" visibly flashed a loading
// state on every single refresh even though myIdentity itself was already
// known instantly from localStorage. Seeding straight from a cached copy
// of the last successfully-loaded config removes that network round-trip
// from the critical path entirely for anyone who's loaded this before —
// the fresh fetch still runs and corrects anything that's genuinely
// changed, but there's no visible gap while it's in flight.
//
// De sleutel zelf staat in planning-cache.ts, bij de andere planning-sleutels
// die bij uitloggen gewist moeten worden.
function loadCachedDepts(): Department[] {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* private browsing, or never loaded before on this device */ }
  return DEPARTMENTS
}

export default function PlanningApp() {
  // Memoized (not recreated every render) — a fresh createClient() call
  // spins up a whole new underlying auth/realtime client, and the live-sync
  // subscription below only ever attaches to whichever instance existed at
  // mount anyway. One stable instance for the component's whole lifetime
  // avoids extra GoTrueClient/RealtimeClient churn in the background.
  const [supabase] = useState(() => createClient())

  const [tab, setTab] = useState<Tab>('mijn')
  useEffect(() => {
    try {
      const stored = localStorage.getItem('planning-active-tab')
      if (stored === 'mijn' || stored === 'team' || stored === 'stats') setTab(stored)
    } catch { /* private browsing */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('planning-active-tab', tab) } catch { /* private browsing */ }
  }, [tab])
  // "Mijn" is always the month view now — a people × 7-day grid reduced to
  // a whole month wouldn't fit Team at that density (the original
  // too-dense problem this redesign exists to fix), so Team's month view
  // is a separate, deliberately compact overview rather than the primary
  // editing surface — the week view stays that. Desktop only — mobile's
  // Team tab is its own list-based surface entirely (MobileTeamDayStepper),
  // not a shrunk version of either of these grids; see the mobile design
  // note further down for why.
  const [teamViewMode, setTeamViewMode] = useState<TeamViewMode>('week')
  useEffect(() => {
    try {
      const stored = localStorage.getItem('planning-team-view-mode')
      if (stored === 'week' || stored === 'month') setTeamViewMode(stored)
    } catch { /* private browsing */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('planning-team-view-mode', teamViewMode) } catch { /* private browsing */ }
  }, [teamViewMode])

  // Mobile's Team tab always needs a week's worth of data regardless of the
  // desktop toggle's stored preference — MobileTeamDayStepper pages through
  // a week internally even though it only shows one day at a time.
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobileViewport(mq.matches)
    const onChange = () => setIsMobileViewport(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const week = useMemo(() => getWeekDates(weekAnchor), [weekAnchor])
  const isCurrentWeek = week.some(w => w.isToday)
  const anchorYear = weekAnchor.getFullYear()
  const anchorMonth = weekAnchor.getMonth() + 1
  const isCurrentMonth = anchorYear === new Date().getFullYear() && anchorMonth === new Date().getMonth() + 1
  const usingWeekNav = tab === 'team' && (teamViewMode === 'week' || isMobileViewport)
  const periodLabel = usingWeekNav ? weekLabel(week) : `${DUTCH_MONTHS[anchorMonth - 1]} ${anchorYear}`

  const [activeDepts, setActiveDepts] = useState<Department[]>(() => loadCachedDepts())
  const [configLoaded, setConfigLoaded] = useState(false)
  // Kon het echte rooster niet gelezen worden, dan is wat hier op het scherm
  // staat de lokale kopie of de hardcoded fallback — niet de waarheid. Alles
  // wat de config zou wegschrijven staat dan stil, want anders overschrijft
  // één mislukte GET het echte rooster met een verouderde kopie uit de code.
  const [configFailed, setConfigFailed] = useState(false)
  const [presets, setPresets] = useState<PlanningPreset[]>([])
  const [showConfig, setShowConfig] = useState(false)

  // Mensen die niet meer meedraaien (bv. oud-stagiairs) worden gearchiveerd,
  // niet verwijderd — anders verdwijnen ze ook uit weken/maanden waarin ze
  // wél echt gewerkt hebben. Standaard verborgen uit Team, terug op te
  // vragen via de toggle naast de zoekbalk.
  const [archived, setArchived] = useState<{ dept: string; emp: string }[]>([])
  const [showArchived, setShowArchived] = useState(false)

  const [data, setData] = useState<PlanningWeekData>({})
  const [loading, setLoading] = useState(true)

  const [userEmail, setUserEmail] = useState<string | undefined>()
  const [myName, setMyName] = useState('')
  const [canEditAll, setCanEditAll] = useState(true)
  const [myColumn, setMyColumn] = useState<string | null>(null)
  const [isBeheer, setIsBeheer] = useState(false)
  const [mySections, setMySections] = useState<string[]>([])
  const [authChecked, setAuthChecked] = useState(false)

  // Een sleutel (`afdeling|naam`), niet een kale naam — zie personKey. Twee
  // mensen met dezelfde voornaam in verschillende afdelingen zijn twee
  // mensen, en op de naam alleen kon de tweede zichzelf niet kiezen.
  const [myIdentity, setMyIdentity] = useState<string | null>(null)
  const [showNamePicker, setShowNamePicker] = useState(false)
  const [identityLoaded, setIdentityLoaded] = useState(false)

  const [teamSearch, setTeamSearch] = useState('')
  const [showProposal, setShowProposal] = useState(false)

  // ── Load departments config ─────────────────────────────────────────────
  // Een lege config (status 200, body `null`) is een geldig antwoord: dan
  // staat er echt nog niets opgeslagen en mag de fallback het vertrekpunt
  // zijn. Een fout is dat niet, en wordt sinds deze wijziging ook als fout
  // teruggegeven in plaats van als lege config.
  useEffect(() => {
    fetch('/api/planning/config')
      .then(r => {
        if (!r.ok) throw new Error(`config ${r.status}`)
        return r.json()
      })
      .then((cfg: Department[] | null) => {
        if (Array.isArray(cfg) && cfg.length > 0) {
          setActiveDepts(cfg)
          try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg)) } catch { /* private browsing */ }
        }
      })
      .catch(() => setConfigFailed(true))
      .finally(() => setConfigLoaded(true))
  }, [])

  // useCallback omdat de drie zelfherstellende effecten hieronder hem in hun
  // dependencies hebben: zonder stabiele identiteit zouden die op elke render
  // opnieuw lopen.
  const handleSaveConfig = useCallback(async (newDepts: Department[]) => {
    if (configFailed) return
    const res = await fetch('/api/planning/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDepts),
    })
    // Mislukt opslaan hoeft niet luidruchtig te zijn, maar de lokale staat mag
    // er dan ook niet doen alsof het gelukt is — anders staat het scherm
    // ergens anders dan de database, en schrijft de cache dat verschil vast.
    if (!res.ok) return
    setActiveDepts(newDepts)
    try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(newDepts)) } catch { /* private browsing */ }
  }, [configFailed])

  // ── Team contacts — the real, actually-maintained source of "who works
  // here" (see /team). New hires land in a "Nieuw" bucket automatically so
  // they get a planning spot without anyone remembering a separate step;
  // admins move them into the right department afterwards. Matched by name
  // only (no shared id with planning_entries), so a rename in Team won't be
  // picked up here — only additions/removals.
  const [teamContacts, setTeamContacts] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [teamContactsLoaded, setTeamContactsLoaded] = useState(false)
  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.json())
      .then((d: { id: string; name: string; email: string | null }[] | null) => { if (Array.isArray(d)) setTeamContacts(d) })
      .catch(() => {})
      .finally(() => setTeamContactsLoaded(true))
  }, [])

  // Real name for whoever last touched a cell (see updated_by) — keyed by
  // normalized email so DayEditor's trace line reads "Robin B." instead of a
  // raw address. Same source of truth as the identity email-match below.
  const emailToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of teamContacts) if (c.email) m.set(c.email.trim().toLowerCase(), c.name)
    return m
  }, [teamContacts])

  // All three self-healing/reconciliation effects below write to the same
  // config, so they share one lock — set synchronously before the async
  // save starts, checked by every effect (including ones declared after
  // this render's effects have already run), so two of them can never both
  // compute "what needs fixing" against the same pre-save state and each
  // save their own half of the fix (that double-save race is exactly what
  // produced the very duplicates the effects below now clean up).
  const configWriteRef = useRef(false)

  // 1) Exact duplicate names within one department (case/accent-
  // insensitive) — e.g. the same name saved twice by the double-save race
  // above before this lock existed.
  //
  // Per afdeling, niet over het hele rooster. Dat deed het eerst wél, en dat
  // is geen ontdubbeling maar gegevensverlies: twee mensen met dezelfde
  // voornaam in verschillende afdelingen ("Thibault" bij Stags PS én bij
  // STAGS Projectkant) zijn twee mensen, en de tweede werd stil uit het
  // rooster gegooid — met al zijn cellen, want die staan op (afdeling, naam)
  // en blijven dus achter onder een afdeling die hem niet meer kent.
  //
  // Binnen één afdeling is het wél een echt duplicaat: dezelfde sleutel, dus
  // dezelfde rijen. Daar valt niets te verliezen.
  useEffect(() => {
    if (!isBeheer || configFailed || activeDepts.length === 0 || configWriteRef.current) return
    let changed = false
    const next = activeDepts.map(d => {
      const seen = new Set<string>()
      const employees = d.employees.filter(e => {
        const key = normName(e)
        if (seen.has(key)) { changed = true; return false }
        seen.add(key)
        return true
      })
      return { ...d, employees }
    })
    if (!changed) return
    configWriteRef.current = true
    handleSaveConfig(next).finally(() => { configWriteRef.current = false })
  }, [isBeheer, configFailed, activeDepts, handleSaveConfig])

  // 2) A long-standing manual-entry convention here stores lots of people as
  // a bare first name only ("Yaro", "Tim", …) rather than a full name — this
  // resolves every one of those against the real Team contact it means.
  // When a first name matches more than one Team contact (two people both
  // named "Jelle", "Thijs", …), a per-name override (declared at module
  // scope so its reference is stable across renders) says which surname goes
  // to which department; anything ambiguous with no override is left
  // untouched (still flagged "niet in team" — a genuine remaining conflict
  // to sort out manually) rather than guessing wrong.
  //
  // Dit schreef de hernoemingen vroeger meteen weg, zonder dat iemand erom
  // vroeg — bij het openen van de pagina door een beheerder. En een
  // hernoeming is hier geen tekstwijziging: planning_entries staat op
  // (afdeling, naam), dus alles wat onder "Yaro" stond verdween uit het
  // raster en bleef meetellen in Statistieken onder een naam die niemand nog
  // ziet. Onbeheerd, en niet terug te draaien.
  //
  // Nu berekent dit effect alleen nog een voorstel. Toepassen gaat via
  // /api/planning/rename, die de rijen mee verhuist. Niet toepassen laat
  // alles staan zoals het staat — dat is het veilige antwoord.
  const [rosterProposal, setRosterProposal] = useState<RosterProposal | null>(null)
  useEffect(() => {
    if (!isBeheer || configFailed || teamContacts.length === 0 || activeDepts.length === 0 || configWriteRef.current) return
    const renames: PlanningRename[] = []
    const additions: { dept: string; emp: string }[] = []
    let changed = false
    const next = activeDepts.map(d => ({ ...d, employees: [...d.employees] }))

    for (const dept of next) {
      for (let i = 0; i < dept.employees.length; i++) {
        const emp = dept.employees[i]
        if (emp.trim().split(/\s+/).length !== 1) continue // only bare names are candidates
        const firstNorm = normName(emp)
        const matches = teamContacts.filter(c => normName(c.name.trim().split(/\s+/)[0] ?? '') === firstNorm)
        if (matches.length === 0) continue // no Team contact at all — a genuine temporary/manual entry
        if (matches.length === 1) {
          if (matches[0].name !== emp) {
            renames.push({ fromDept: dept.name, fromEmp: emp, toDept: dept.name, toEmp: matches[0].name })
            dept.employees[i] = matches[0].name
            changed = true
          }
          continue
        }
        const override = AMBIGUOUS_FIRST_NAME_OVERRIDES[firstNorm]
        if (!override) continue // ambiguous, no known resolution — leave flagged
        const here = override.find(o => o.dept === dept.name)
        if (!here) continue // this slot's department isn't one of the overrides — leave it
        const contact = matches.find(c => normName(c.name.trim().split(/\s+/)[1] ?? '').startsWith(here.surnamePrefix))
        if (contact && contact.name !== emp) {
          renames.push({ fromDept: dept.name, fromEmp: emp, toDept: dept.name, toEmp: contact.name })
          dept.employees[i] = contact.name
          changed = true
        }
      }
    }

    // Any override target not now present anywhere (the other side of an
    // ambiguous pair — there's only one bare slot to rename, so whichever
    // contact didn't get it needs a fresh entry) gets added under its dept.
    for (const [firstNorm, entries] of Object.entries(AMBIGUOUS_FIRST_NAME_OVERRIDES)) {
      for (const o of entries) {
        const contact = teamContacts.find(c =>
          normName(c.name.trim().split(/\s+/)[0] ?? '') === firstNorm &&
          normName(c.name.trim().split(/\s+/)[1] ?? '').startsWith(o.surnamePrefix)
        )
        if (!contact) continue
        const present = next.some(d => d.employees.some(e => normName(e) === normName(contact.name)))
        if (present) continue
        let bucket = next.find(d => d.name === o.dept)
        if (!bucket) { bucket = { name: o.dept, employees: [] }; next.push(bucket) }
        bucket.employees.push(contact.name)
        additions.push({ dept: o.dept, emp: contact.name })
        changed = true
      }
    }

    // Zelfde voorstel niet opnieuw aanbieden: zonder deze vergelijking zou
    // elke render die activeDepts aanraakt een nieuw object zetten en de balk
    // laten knipperen.
    setRosterProposal(prev => {
      const proposal = changed ? { renames, additions, departments: next } : null
      if (sameProposal(prev, proposal)) return prev
      return proposal
    })
  }, [isBeheer, configFailed, teamContacts, activeDepts])

  // Bumped whenever the tab regains visibility (see the realtime effect
  // further down) purely to force the load effect to re-run — an independent
  // safety net so coming back to the tab always refetches, regardless of
  // whether the realtime socket caught everything meanwhile.
  //
  // Staat hier, boven applyRenames, omdat die hem ook gebruikt: na een
  // verhuizing staan de cellen onder een andere naam en moet het raster
  // opnieuw ophalen.
  const [refreshTick, setRefreshTick] = useState(0)

  // Verhuizen: eerst de rijen, dan het rooster — allebei in één route, zodat
  // ze niet uit elkaar kunnen lopen. Gedeeld door het voorstel hieronder en
  // door de configuratiemodal, want die doet precies hetzelfde zodra iemand
  // daar een naam hernoemt of naar een andere afdeling sleept.
  const applyRenames = useCallback(async (
    renames: PlanningRename[],
    departments: Department[],
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const res = await fetch('/api/planning/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames, departments }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as RenameResponse | null
        const blocked = body?.results?.filter(r => !r.ok) ?? []
        return {
          ok: false,
          error: blocked.length > 0
            ? blocked.map(r => `${r.fromEmp} → ${r.toEmp}: ${r.reason ?? 'mislukt'}`).join(' · ')
            : body?.reason ?? `Verplaatsen mislukt (${res.status}).`,
        }
      }
      setActiveDepts(departments)
      try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(departments))
      } catch { /* private browsing */ }
      // De verhuisde cellen staan nu onder een andere naam, dus wat in het
      // raster en in de maandcache zit klopt niet meer. Alleen de maandkopie:
      // wie je bent is niet veranderd.
      clearPlanningMonthCache()
      setRefreshTick(t => t + 1)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Verplaatsen mislukt — geen verbinding?' }
    }
  }, [])

  const [applyingProposal, setApplyingProposal] = useState(false)
  const [proposalError, setProposalError] = useState('')

  async function applyRosterProposal() {
    if (!rosterProposal || applyingProposal) return
    setApplyingProposal(true)
    setProposalError('')
    const res = await applyRenames(rosterProposal.renames, rosterProposal.departments)
    if (res.ok) setRosterProposal(null)
    else setProposalError(res.error)
    setApplyingProposal(false)
  }

  // 3) New Team contacts land in a "Nieuw" bucket automatically. Someone
  // already represented by a bare first name (see above) counts as known —
  // otherwise this would just recreate the exact duplicates effect 2 cleans
  // up. Trade-off: a genuinely new person who happens to share a first name
  // with an existing bare entry won't be auto-added either; same as any
  // other name-only match in this feature, that's a manual add.
  useEffect(() => {
    if (!isBeheer || configFailed || teamContacts.length === 0 || activeDepts.length === 0 || configWriteRef.current) return
    const known = new Set(activeDepts.flatMap(d => d.employees.map(e => normName(e))))
    const bareFirstNames = new Set(
      activeDepts.flatMap(d => d.employees)
        .filter(e => e.trim().split(/\s+/).length === 1)
        .map(e => normName(e))
    )
    const seenTeamNames = new Set<string>()
    const uniqueTeamContacts = teamContacts.filter(c => {
      const key = normName(c.name)
      if (!c.name.trim() || seenTeamNames.has(key)) return false
      seenTeamNames.add(key)
      return true
    })
    const missing = uniqueTeamContacts.filter(c => {
      const full = normName(c.name)
      if (known.has(full)) return false
      const first = normName(c.name.trim().split(/\s+/)[0])
      return !bareFirstNames.has(first)
    })
    if (missing.length === 0) return
    const next = activeDepts.map(d => ({ ...d, employees: [...d.employees] }))
    let bucket = next.find(d => d.name === UNASSIGNED_DEPT)
    if (!bucket) { bucket = { name: UNASSIGNED_DEPT, employees: [] }; next.push(bucket) }
    bucket.employees.push(...missing.map(c => c.name))
    configWriteRef.current = true
    handleSaveConfig(next).finally(() => { configWriteRef.current = false })
  }, [isBeheer, configFailed, teamContacts, activeDepts, handleSaveConfig])

  // ── Load presets ─────────────────────────────────────────────────────────
  // Ook opnieuw op te vragen: de Presets-tab in de configuratiemodal schrijft
  // meteen weg en hield zijn eigen lijst bij, maar vertelde het hier nooit —
  // een nieuwe of hernoemde status stond pas in het raster na een refresh.
  const loadPresets = useCallback(() => {
    fetch('/api/planning/presets')
      .then(r => r.json())
      .then(p => { if (Array.isArray(p)) setPresets(p) })
      .catch(() => {})
  }, [])

  useEffect(() => { loadPresets() }, [loadPresets])

  // ── Load archived employees ──────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/planning/archived')
      .then(r => r.json())
      .then((a: { dept: string; emp: string }[] | null) => { if (Array.isArray(a)) setArchived(a) })
      .catch(() => {})
  }, [])

  async function handleSaveArchived(next: { dept: string; emp: string }[]) {
    setArchived(next)
    await fetch('/api/planning/archived', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  }

  const isArchived = useCallback(
    (p: { dept: string; emp: string }) => archived.some(a => a.dept === p.dept && a.emp === p.emp),
    [archived]
  )

  // ── Load permissions ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setAuthChecked(true); return }
      setUserEmail(user.email ?? undefined)
      setMyName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
      const permsObj = user.app_metadata?.permissions ?? null
      const sections: string[] = permsObj?.sections ?? []
      setMySections(sections)
      const admin = isAdminUser(user)
      setIsBeheer(admin)
      if (admin || permsObj === null || sections.includes('planning_volledig')) {
        setCanEditAll(true)
      } else {
        setCanEditAll(false)
        setMyColumn(permsObj.planning_column ?? null)
      }
      setAuthChecked(true)
    })
  }, [])

  const canSeeStats = isBeheer || mySections.includes('planning_statistieken')

  // A restored 'stats' tab (see the localStorage restore above) needs to be
  // corrected once permissions actually resolve, in case that permission
  // was since revoked, or this device's stored preference belongs to
  // someone else — otherwise the content pane would just sit empty (its
  // own tab button also gone, since that's gated the same way).
  useEffect(() => {
    if (authChecked && tab === 'stats' && !canSeeStats) setTab('mijn')
  }, [authChecked, tab, canSeeStats])

  const canEditCol = useCallback((p: Person): boolean => {
    if (canEditAll) return true
    if (myColumn === '__none__') return false
    if (myColumn === null) return true
    // Nieuwe toekenningen staan als `afdeling|naam` in de permissies. Een
    // toekenning van vóór die wijziging is een kale naam; die blijft op de
    // naam vergelijken (en ontgrendelt dus nog beide naamgenoten) in plaats
    // van iemand stil buiten te sluiten. Opnieuw toekennen in het beheer
    // zet hem in de nieuwe vorm.
    const assigned = parsePersonKey(myColumn)
    return assigned ? assigned.dept === p.dept && assigned.emp === p.emp : myColumn === p.emp
  }, [canEditAll, myColumn])

  // ── Identity: "who am I in this roster" ─────────────────────────────────
  const everyEmployee = useMemo(
    () => activeDepts.flatMap(d => d.employees.map(emp => ({ dept: d.name, emp }))),
    [activeDepts]
  )

  // Archived people are excluded from anything that offers a fresh choice
  // (name picker, first-name guessing) but everyEmployee itself stays the
  // full list — someone whose own identity got archived should still be
  // able to see their own past entries.
  const activeEveryEmployee = useMemo(
    () => everyEmployee.filter(p => !isArchived(p)),
    [everyEmployee, isArchived]
  )

  const pickableDepts = useMemo(
    () => activeDepts
      .map(d => ({ name: d.name, employees: d.employees.filter(emp => !isArchived({ dept: d.name, emp })) }))
      .filter(d => d.employees.length > 0),
    [activeDepts, isArchived]
  )

  // Meteen uit localStorage, zodat "Mijn maand" niet op elke refresh kort
  // leeg staat. Of die keuze wel bij dít account hoort, wordt hieronder
  // nagekeken zodra de login bekend is.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(IDENTITY_KEY)
      if (stored) setMyIdentity(stored)
    } catch { /* private browsing */ }
    setIdentityLoaded(true)
  }, [])

  const rememberIdentity = useCallback((name: string, account: string | undefined) => {
    try {
      localStorage.setItem(IDENTITY_KEY, name)
      localStorage.setItem(IDENTITY_ACCOUNT_KEY, (account ?? '').trim().toLowerCase())
    } catch { /* private browsing */ }
  }, [])

  const forgetIdentity = useCallback(() => {
    try {
      localStorage.removeItem(IDENTITY_KEY)
      localStorage.removeItem(IDENTITY_ACCOUNT_KEY)
    } catch { /* private browsing */ }
  }, [])

  useEffect(() => {
    if (myColumn && myColumn !== '__none__') setMyIdentity(myColumn)
  }, [myColumn])

  // Real identity, derived from the login itself instead of a guessed/typed
  // name: match the logged-in account's email against a Team contact's
  // email (the same contacts /team already maintains). Runs once everything
  // it depends on has actually settled (auth, Team contacts, and the real
  // department config, not just the hardcoded fallback) so it doesn't fire
  // prematurely against incomplete data. Only ever fills in a still-empty
  // identity — never overrides a manual pick (see NamePicker below), and
  // never touches a permission-locked column.
  //
  // Plus: een opgeslagen keuze hoort bij het account dat hem maakte. Op een
  // gedeelde laptop zag wie daarna inlogde de "Mijn maand" van de vorige
  // persoon staan, en kon die ook bewerken — de keuze werd immers nooit
  // tegen het ingelogde account gehouden. Hoort hij bij iemand anders, dan
  // valt hij weg en begint de e-mailmatch hieronder gewoon opnieuw.
  const [emailMatchAttempted, setEmailMatchAttempted] = useState(false)
  useEffect(() => {
    if (!authChecked || !teamContactsLoaded || !configLoaded) return

    const wanted = userEmail?.trim().toLowerCase() ?? ''
    const match = wanted
      ? teamContacts.find(c => c.email && c.email.trim().toLowerCase() === wanted) ?? null
      : null
    const slot = match ? activeEveryEmployee.find(p => p.emp === match.name) ?? null : null
    const matchInRoster = slot ? personKey(slot) : null

    // Een permissie-kolom komt van het account zelf, dus die kan nooit van
    // iemand anders zijn en wordt hier niet aangeraakt.
    if (!myColumn && myIdentity) {
      let owner: string | null = null
      try { owner = localStorage.getItem(IDENTITY_ACCOUNT_KEY) } catch { /* private browsing */ }

      if (owner !== null && owner !== wanted) {
        // Bekend, en van iemand anders.
        setMyIdentity(null)
        forgetIdentity()
        setEmailMatchAttempted(true)
        return
      }
      if (owner === null) {
        // Opgeslagen vóór deze sleutel bestond: van wie weten we niet. Wijst
        // de login naar een andere naam, dan is dat het betrouwbaardere
        // antwoord; anders nemen we aan dat hij van dit account is.
        if (matchInRoster && matchInRoster !== myIdentity) {
          setMyIdentity(matchInRoster)
          rememberIdentity(matchInRoster, userEmail)
        } else {
          rememberIdentity(myIdentity, userEmail)
        }
        setEmailMatchAttempted(true)
        return
      }
    }

    if (myIdentity || myColumn) { setEmailMatchAttempted(true); return }
    if (matchInRoster) {
      setMyIdentity(matchInRoster)
      rememberIdentity(matchInRoster, userEmail)
    }
    setEmailMatchAttempted(true)
  }, [authChecked, teamContactsLoaded, configLoaded, userEmail, teamContacts, myIdentity, myColumn, activeEveryEmployee, rememberIdentity, forgetIdentity])

  // Als sleutel, zodat de voorselectie in de naamkiezer bij één specifieke
  // rij hoort. Blijft bewust alleen gokken als er precies één kandidaat is.
  const nameGuess = useMemo(() => {
    if (!myName) return null
    const myFirst = norm(myName).split(' ')[0]
    if (!myFirst) return null
    const candidates = activeEveryEmployee.filter(p => norm(p.emp).split(' ')[0] === myFirst)
    return candidates.length === 1 ? personKey(candidates[0]) : null
  }, [myName, activeEveryEmployee])

  // Ask once, only after we've actually checked localStorage, attempted the
  // email match above, and loaded the roster — otherwise this would flash
  // on every load before either has had a chance to apply.
  useEffect(() => {
    if (identityLoaded && emailMatchAttempted && activeEveryEmployee.length > 0 && !myIdentity && !myColumn) setShowNamePicker(true)
  }, [identityLoaded, emailMatchAttempted, activeEveryEmployee, myIdentity, myColumn])

  function confirmIdentity(key: string) {
    setMyIdentity(key)
    rememberIdentity(key, userEmail)
    setShowNamePicker(false)
  }

  const myPerson = useMemo(() => {
    if (!myIdentity) return null
    const parsed = parsePersonKey(myIdentity)
    // Zonder scheidingsteken: een keuze van vóór deze wijziging, of een
    // permissie-kolom in de oude vorm. Dan valt er niets beters te doen dan
    // de eerste naamgenoot nemen — hetzelfde als voorheen.
    if (!parsed) return everyEmployee.find(p => p.emp === myIdentity) ?? null
    return everyEmployee.find(p => p.dept === parsed.dept && p.emp === parsed.emp) ?? null
  }, [everyEmployee, myIdentity])

  // "Mijn maand" renders full calendar weeks (see getMonthWeeks), so the
  // first/last week can spill into the neighboring month — those overflow
  // days need their data loaded too, not just the target month's own days.
  //
  // Memoized because its identity, not its contents, is what the load
  // callback and the load effect below compare on. getMonthWeeks(...).flat()
  // builds a new array on every render, so without this the effect saw a
  // changed dependency each time the component rendered at all — including
  // renders its own fetch had just caused.
  const daysToLoad = useMemo(
    () => (usingWeekNav ? week : getMonthWeeks(anchorYear, anchorMonth).flat()),
    [usingWeekNav, week, anchorYear, anchorMonth]
  )

  // Extracted out of the effect below so the same fetch can also be run
  // silently by the background-poll and network-restored safety nets
  // further down, without duplicating the query/merge logic. `loadCallId`
  // supersedes React's usual per-effect cancellation flag — any caller
  // (navigation, poll, or reconnect) can trigger a load, so "am I still
  // the most recent one" needs to be tracked globally, not per-effect.
  const loadCallIdRef = useRef(0)

  // What each loaded month holds: every cell key in it, and the newest
  // timestamp among its rows. Both the background poll and the cache sync
  // compare against this instead of fetching the month again.
  //
  // Keys rather than a bare count, because a count alone can't tell an
  // insert from a swap. Emptying one cell and filling another leaves the
  // total unchanged, and the old check read that as "nothing happened".
  const periodStateRef = useRef(new Map<string, { keys: Set<string>; lastSeen: string }>())

  const groupKey = (g: { year: number; month: number }) => monthCacheKey(g.year, g.month)

  function rowToCell(r: PlanningRow) {
    return {
      value: r.value, bold: r.bold ?? true,
      textColor: r.text_color ?? '#ffffff', bgColor: r.bg_color ?? null,
      note: r.note ?? null,
      updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null,
    }
  }

  const rowKey = (r: PlanningRow) => dateCellKey(r.year, r.month, r.day, r.department, r.employee)

  const newestOf = (rows: PlanningRow[], floor: string) =>
    rows.reduce<string>((max, r) => (r.updated_at && r.updated_at > max ? r.updated_at : max), floor)

  // Which whole months the visible period touches. Deliberately whole months
  // and not just the visible days: a week needs roughly a quarter of a
  // month's rows, so walking four weeks forward used to cost four fetches
  // where one now covers all of them and every later visit is free.
  const monthsToLoad = useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>()
    for (const g of groupWeekByMonth(daysToLoad)) {
      seen.set(`${g.year}-${g.month}`, { year: g.year, month: g.month })
    }
    return [...seen.values()]
  }, [daysToLoad])

  const fetchMonth = useCallback((g: { year: number; month: number }) =>
    fetchAllRows<PlanningRow>(() =>
      supabase.from('planning_entries').select(SELECT_COLS)
        .eq('year', g.year).eq('month', g.month)
        .order('id', { ascending: true })
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [])

  // Bring one already-loaded month up to date without fetching it again.
  //
  // Two small questions: which rows changed since we last looked, and how
  // many rows does the month hold now. Together they are exact, which a
  // count on its own is not.
  //
  // The reasoning: every insert carries a fresh updated_at (the database sets
  // it, see migration 0050), so an insert always comes back in the changed
  // rows. That makes the row count we *should* see computable — what we had,
  // plus the changed rows whose cell we didn't know yet. If the real count is
  // lower, rows were deleted, and a deletion can't be fetched because it no
  // longer exists. Only then is a full re-fetch needed.
  //
  // So an edit or an addition costs a few hundred bytes. A deletion costs one
  // re-fetch. Before this, any change in the count at all forced that
  // re-fetch, including a plain addition.
  // When each month was last synced in this session — see POLL_INTERVAL.
  const lastSyncedRef = useRef(new Map<string, number>())

  const syncMonth = useCallback(async (g: { year: number; month: number }, callId: number): Promise<boolean> => {
    const known = periodStateRef.current.get(groupKey(g))
    if (!known) return false

    const [changed, counted] = await Promise.all([
      fetchAllRows<PlanningRow>(() =>
        supabase.from('planning_entries').select(SELECT_COLS)
          .eq('year', g.year).eq('month', g.month)
          .gt('updated_at', known.lastSeen)
          .order('id', { ascending: true })
      ),
      supabase.from('planning_entries').select('year', { count: 'exact', head: true })
        .eq('year', g.year).eq('month', g.month),
    ])
    if (callId !== loadCallIdRef.current) return true // superseded; nothing to do

    const added = changed.filter(r => !known.keys.has(rowKey(r)))
    const expected = known.keys.size + added.length
    if ((counted.count ?? expected) !== expected) return false // rows were deleted

    lastSyncedRef.current.set(groupKey(g), Date.now())
    if (changed.length === 0) return true

    setData(prev => {
      const next = { ...prev }
      for (const r of changed) next[rowKey(r)] = rowToCell(r)
      return next
    })

    const keys = new Set(known.keys)
    for (const r of added) keys.add(rowKey(r))
    const lastSeen = newestOf(changed, known.lastSeen)
    periodStateRef.current.set(groupKey(g), { keys, lastSeen })

    // The cached copy has to move with it, or the next page load would paint
    // from a month that is now known to be out of date.
    const cached = readCachedMonth(g.year, g.month)
    if (cached) {
      const byKey = new Map(cached.rows.map(r => [rowKey(r), r]))
      for (const r of changed) byKey.set(rowKey(r), r)
      writeCachedMonth(g.year, g.month, [...byKey.values()], lastSeen)
    }
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncMonthRef = useRef(syncMonth)
  useEffect(() => { syncMonthRef.current = syncMonth }, [syncMonth])

  const adoptMonth = useCallback((g: { year: number; month: number }, rows: PlanningRow[]) => {
    periodStateRef.current.set(groupKey(g), {
      keys: new Set(rows.map(rowKey)),
      lastSeen: newestOf(rows, '1970-01-01T00:00:00Z'),
    })
  }, [])

  // Live events arrive outside the load/sync path, so they have to keep the
  // same bookkeeping in step — only for a month we actually track; anything
  // else gets its key set built from scratch when you navigate there.
  const rememberKey = useCallback((year: number, month: number, key: string) => {
    const known = periodStateRef.current.get(monthCacheKey(year, month))
    if (known) known.keys.add(key)
  }, [])

  const forgetKey = useCallback((year: number, month: number, key: string) => {
    const known = periodStateRef.current.get(monthCacheKey(year, month))
    if (known) known.keys.delete(key)
  }, [])

  const loadPeriodData = useCallback(async (opts?: { silent?: boolean; skipCache?: boolean }): Promise<void> => {
    const callId = ++loadCallIdRef.current
    const months = monthsToLoad

    // Paint from the cached copy first, if every visible month has one. A
    // partial hit isn't worth splitting the path for — it only happens on
    // the week that straddles two months — so that falls through to the
    // full fetch below.
    if (!opts?.skipCache) {
      const cached = months.map(g => readCachedMonth(g.year, g.month))
      if (cached.every(c => c !== null)) {
        const map: PlanningWeekData = {}
        cached.forEach((c, i) => {
          for (const r of c!.rows) map[rowKey(r)] = rowToCell(r)
          periodStateRef.current.set(groupKey(months[i]), {
            keys: new Set(c!.rows.map(rowKey)),
            lastSeen: c!.lastSeen,
          })
        })
        setData(map)
        setLoading(false)

        // Now catch up on whatever changed while this copy sat in the
        // browser — unless it was already synced moments ago, in which case
        // nothing leaves the browser at all. A month that can't be synced
        // incrementally (rows were deleted) is re-fetched in full, silently;
        // what's on screen is already a reasonable answer in the meantime.
        const stale = months.filter(g =>
          Date.now() - (lastSyncedRef.current.get(groupKey(g)) ?? 0) > POLL_INTERVAL)
        if (stale.length === 0) return
        const synced = await Promise.all(stale.map(g => syncMonthRef.current(g, callId)))
        if (callId !== loadCallIdRef.current) return
        if (synced.every(Boolean)) return
        return loadPeriodDataRef.current({ silent: true, skipCache: true })
      }
    }

    if (!opts?.silent) setLoading(true)
    const results = await Promise.all(months.map(fetchMonth))
    if (callId !== loadCallIdRef.current) return // superseded by a newer load

    const map: PlanningWeekData = {}
    results.forEach((rows, i) => {
      for (const r of rows) map[rowKey(r)] = rowToCell(r)
      adoptMonth(months[i], rows)
      lastSyncedRef.current.set(groupKey(months[i]), Date.now())
      writeCachedMonth(months[i].year, months[i].month, rows, newestOf(rows, '1970-01-01T00:00:00Z'))
    })
    setData(map)
    if (!opts?.silent) setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsToLoad])

  // The cheap version of the above, for the background safety net.
  //
  // Re-fetching the visible month every twenty seconds per open tab is how a
  // 5 GB monthly allowance went in a few weeks — about 2 MB an hour each, and
  // three requests a minute on top. (Measured on the wire: Supabase gzips, so
  // a month is roughly 10 kB a time, not the 194 kB of raw JSON it looks like
  // locally.) syncMonth asks two much smaller questions instead, and only
  // falls back to a re-fetch when rows were actually deleted.
  const pollForChanges = useCallback(async (): Promise<void> => {
    const callId = ++loadCallIdRef.current
    for (const g of monthsToLoad) {
      if (!periodStateRef.current.get(groupKey(g))) {
        return loadPeriodDataRef.current({ silent: true })
      }
      const ok = await syncMonthRef.current(g, callId)
      if (callId !== loadCallIdRef.current) return
      if (!ok) return loadPeriodDataRef.current({ silent: true, skipCache: true })
    }
  }, [monthsToLoad])

  // Kept in a ref so the polling effect below (registered once, empty deps
  // — it shouldn't tear down and recreate its interval on every render)
  // always calls the version bound to the currently visible period.
  const loadPeriodDataRef = useRef(loadPeriodData)
  useEffect(() => { loadPeriodDataRef.current = loadPeriodData }, [loadPeriodData])

  const pollForChangesRef = useRef(pollForChanges)
  useEffect(() => { pollForChangesRef.current = pollForChanges }, [pollForChanges])

  // Clearing a selection deletes every cell in it separately, and each one
  // reaches every open tab as its own event. Without coalescing, emptying
  // forty cells with ten people watching would fire four hundred polls in a
  // couple of seconds — each small, but it's the number of requests that the
  // log quota counts, and that's the one we're furthest over.
  //
  // One poll answers all of them: it compares the row count, finds it no
  // longer matches, and reloads the period once.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null
      pollForChangesRef.current()
    }, 1500)
  }, [])

  const schedulePollRef = useRef(schedulePoll)
  useEffect(() => { schedulePollRef.current = schedulePoll }, [schedulePoll])

  useEffect(() => () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }, [])

  // ── Load the visible period's data (a week, or a whole month) ───────────
  useEffect(() => {
    loadPeriodData()
    // refreshTick has no real value of its own — bumping it is just a way to
    // force this effect to re-run (a fresh refetch) when the tab regains
    // visibility, as a safety net independent of whether the realtime
    // socket below actually caught everything while backgrounded.
  }, [loadPeriodData, refreshTick])

  // No matter how solid the realtime socket is, a tab left open (or a laptop
  // asleep with the tab still frontmost) has no browser-level signal this app
  // can react to — that's a real limit, not something fixable here. This
  // silent poll puts a ceiling on how stale things are ever allowed to get:
  // worst case, what's on screen catches up within one interval even if the
  // socket died in a way nothing else caught.
  //
  // Two things keep it from being expensive. It only runs while the page is
  // actually visible — a backgrounded tab needs fresh data when you come back
  // to it, and coming back already triggers a full reload on its own. And it
  // asks pollForChanges rather than reloading the period, which is the
  // difference between about 2 kB and about 10 kB a time.
  //
  // A minute rather than twenty seconds: this is the backstop behind realtime,
  // not the thing keeping the screen live.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pollForChangesRef.current()
    }, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  // ── Live updates — other people's edits land here as they happen, not
  // just after navigating away and back. Merges straight into `data`
  // regardless of the currently visible period; anything outside it just
  // sits unused until you scroll there, and gets replaced by the load
  // effect above on the next real navigation anyway.
  //
  // Realtime's per-row authorization is tied to the access token active at
  // subscribe time — on a tab left open long enough for that token to
  // rotate (every ~1h), the socket can keep showing "connected" while
  // quietly no longer passing RLS for new events unless it's told about
  // the refreshed token. Set immediately from whatever session already
  // exists (not just on future auth *changes* — a page loaded with an
  // already-restored session never fires SIGNED_IN/TOKEN_REFRESHED on its
  // own) and kept current after that.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.realtime.setAuth(session?.access_token ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // Confirmed live: the socket can simply disappear with no error the app
  // ever sees — browsers throttle or fully suspend background tabs' timers
  // and heartbeats, which can kill a long-lived WebSocket without firing a
  // close event to react to. Two safety nets instead of trusting the
  // socket to recover on its own: (1) an explicit error/timeout/close
  // status triggers a delayed resubscribe, and (2) regaining tab
  // visibility always forces a clean resubscribe *and* bumps refreshTick
  // (a fresh refetch of whatever's on screen) — so just switching back to
  // the tab is enough to catch up, regardless of whether the socket
  // quietly died while backgrounded.
  useEffect(() => {
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    // The channel this effect currently considers "live" — deliberately
    // separate from the local `thisChannel` captured inside connect()'s
    // closure below. removeChannel()/unsubscribe() fires that same
    // channel's own status callback with CLOSED synchronously as part of
    // its normal cleanup — confirmed live, this produced an infinite
    // self-triggering reconnect loop (thousands of "CLOSED" logs in a
    // tight cycle) before this identity check existed, because that
    // self-inflicted CLOSED was indistinguishable from a real dropped
    // connection. Once `current` no longer points at a given channel, its
    // callback is from a superseded attempt and gets ignored entirely.
    let current: ReturnType<typeof supabase.channel> | null = null
    let backoff = 2000
    const MAX_BACKOFF = 30000

    function connect() {
      const thisChannel = supabase
        .channel(`planning-entries-live-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'planning_entries' },
          payload => {
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<PlanningRow>

              // Postgres only puts the primary key in a DELETE's old row
              // unless the table is set to full replica identity — and this
              // one's identity is the year/month/day/department/employee
              // combination, not that id. Measured against the live database:
              // what arrives here is `{ id: … }` and nothing else, which names
              // no cell at all.
              //
              // Migration 0045 sets that identity, but it depends on having
              // been applied — and on Realtime having picked it up. Rather
              // than trust a database setting this code can't see, an
              // unusable payload falls through to a poll: that compares the
              // row count, finds one missing, and reloads. One small request,
              // only when something is actually deleted.
              if (old.year === undefined || old.department === undefined || old.employee === undefined) {
                schedulePollRef.current()
                return
              }

              const key = dateCellKey(old.year!, old.month!, old.day!, old.department!, old.employee!)
              setData(prev => {
                const next = { ...prev }
                delete next[key]
                return next
              })
              // The bookkeeping syncMonth compares against has to follow,
              // or the next sync would count a row that is gone and fall
              // back to re-fetching the whole month for nothing.
              forgetKey(old.year!, old.month!, key)
              return
            }
            const row = payload.new as {
              year: number; month: number; day: number; department: string; employee: string
              value: string; bold: boolean | null; text_color: string | null; bg_color: string | null; note: string | null
              updated_by: string | null; updated_at: string | null
            }
            const key = dateCellKey(row.year, row.month, row.day, row.department, row.employee)
            setData(prev => ({
              ...prev,
              [key]: {
                value: row.value, bold: row.bold ?? true,
                textColor: row.text_color ?? '#ffffff', bgColor: row.bg_color ?? null,
                note: row.note ?? null,
                updatedBy: row.updated_by ?? null, updatedAt: row.updated_at ?? null,
              },
            }))
            rememberKey(row.year, row.month, key)
          }
        )
        .subscribe((status, err) => {
          if (thisChannel !== current) return // superseded — ignore
          if (status === 'SUBSCRIBED') {
            backoff = 2000
            return
          }
          // Previously silent — a dropped/failed connection here looked
          // identical to "no one else has edited anything yet" from the
          // UI's perspective. Exponential backoff (capped at 30s) instead
          // of a fixed 2s retry — a real network/connectivity outage
          // shouldn't turn into a tight hammering loop while it's down.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('Planning live-sync kanaal:', status, err ?? '')
            if (!cancelled) {
              reconnectTimer = setTimeout(() => {
                backoff = Math.min(backoff * 2, MAX_BACKOFF)
                reconnect()
              }, backoff)
            }
          }
        })
      current = thisChannel
    }

    function reconnect() {
      const old = current
      current = null // so the old channel's own cleanup-triggered CLOSED is ignored above
      if (old) supabase.removeChannel(old)
      connect()
    }

    connect()

    // Shared by tab-refocus AND network-restored — a laptop waking from
    // sleep with the tab still frontmost the whole time fires 'online',
    // not visibilitychange, since the tab was never actually hidden; a
    // dropped wifi/network change is a distinct failure mode from a
    // throttled background tab and needs its own trigger.
    function handleReconnectSignal() {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      backoff = 2000
      reconnect()
      setRefreshTick(t => t + 1)
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') handleReconnectSignal()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleReconnectSignal)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleReconnectSignal)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const old = current
      current = null
      if (old) supabase.removeChannel(old)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply / clear, with local undo (Ctrl+Z) ─────────────────────────────
  // The stack lives only in this component's memory — reset on reload, never
  // shared — so undo can only ever reach changes the current user just made
  // in this session, never anyone else's edits or anything from before.
  const undoStackRef = useRef<{ wd: WeekDay; dept: string; emp: string; before: CellData | null }[][]>([])

  type WriteEntry = { wd: WeekDay; dept: string; emp: string; cell: CellData | null }

  async function writeEntries(entries: WriteEntry[]) {
    setData(prev => {
      const next = { ...prev }
      for (const e of entries) {
        const key = weekDayCellKey(e.wd, e.dept, e.emp)
        if (e.cell) next[key] = e.cell
        else delete next[key]
      }
      return next
    })
    // Straight away, not waiting for our own change to come back over the
    // socket. A sync landing in that gap would see a row count that doesn't
    // match its bookkeeping and re-fetch the whole month for nothing.
    for (const e of entries) {
      const key = weekDayCellKey(e.wd, e.dept, e.emp)
      if (e.cell) rememberKey(e.wd.year, e.wd.month, key)
      else forgetKey(e.wd.year, e.wd.month, key)
    }
    const toUpsert = entries.filter(e => e.cell)
    const toDelete = entries.filter(e => !e.cell)
    if (toUpsert.length > 0) {
      const rows = toUpsert.map(e => ({
        year: e.wd.year, month: e.wd.month, day: e.wd.day, department: e.dept, employee: e.emp,
        value: e.cell!.value, bold: e.cell!.bold, text_color: e.cell!.textColor, bg_color: e.cell!.bgColor, note: e.cell!.note,
        // updated_at wordt bewust niet meegestuurd: een trigger op de tabel
        // zet hem met de klok van de database. De planning zoekt op die
        // tijdstempel om alleen wijzigingen op te halen, en een browserklok
        // die achterloopt zou wijzigingen onzichtbaar maken.
        updated_by: userEmail,
      }))
      await supabase.from('planning_entries').upsert(rows, { onConflict: 'year,month,day,department,employee' })
    }
    if (toDelete.length > 0) {
      await Promise.all(toDelete.map(e =>
        supabase.from('planning_entries').delete()
          .eq('year', e.wd.year).eq('month', e.wd.month).eq('day', e.wd.day)
          .eq('department', e.dept).eq('employee', e.emp)
      ))
    }
  }

  function pushUndo(targets: { wd: WeekDay; dept: string; emp: string }[]) {
    const before = targets.map(t => ({ ...t, before: data[weekDayCellKey(t.wd, t.dept, t.emp)] ?? null }))
    undoStackRef.current.push(before)
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
  }

  async function applyToTargets(targets: { wd: WeekDay; dept: string; emp: string }[], cell: CellData) {
    pushUndo(targets)
    await writeEntries(targets.map(t => ({ ...t, cell })))
  }

  async function clearTargets(targets: { wd: WeekDay; dept: string; emp: string }[]) {
    pushUndo(targets)
    await writeEntries(targets.map(t => ({ ...t, cell: null })))
  }

  async function handleUndo() {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    await writeEntries(entry.map(e => ({ wd: e.wd, dept: e.dept, emp: e.emp, cell: e.before })))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (!isUndo) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      handleUndo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function goToToday() { setWeekAnchor(new Date()) }
  function goPrev() { setWeekAnchor(a => usingWeekNav ? addWeeks(a, -1) : addMonths(a, -1)) }
  function goNext() { setWeekAnchor(a => usingWeekNav ? addWeeks(a, 1) : addMonths(a, 1)) }
  const isCurrentPeriod = usingWeekNav ? isCurrentWeek : isCurrentMonth

  const visibleTeam: Person[] = useMemo(() => {
    const pool = showArchived ? everyEmployee : activeEveryEmployee
    if (!teamSearch.trim()) return pool
    const q = norm(teamSearch)
    return pool.filter(p => norm(p.emp).includes(q))
  }, [everyEmployee, activeEveryEmployee, showArchived, teamSearch])

  const archivedCount = everyEmployee.length - activeEveryEmployee.length

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Period navigation — shared by Mijn/Team; Statistieken has its own
          jaar/maand controls (a report over a chosen period, not "the
          currently visible week/month"), so this stays hidden there. */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {tab !== 'stats' && (
          <>
            <button onClick={goPrev} aria-label={usingWeekNav ? 'Vorige week' : 'Vorige maand'}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
              <ChevronLeft size={15} />
            </button>
            <MiniCalendarPicker anchor={weekAnchor} onSelect={setWeekAnchor} label={periodLabel} />
            <button onClick={goNext} aria-label={usingWeekNav ? 'Volgende week' : 'Volgende maand'}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
              <ChevronRight size={15} />
            </button>
            {!isCurrentPeriod && (
              <button onClick={goToToday}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
                Vandaag
              </button>
            )}
            {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {tab === 'team' && (
            <div className="hidden lg:flex items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
              {(['week', 'month'] as TeamViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setTeamViewMode(v)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={teamViewMode === v ? { backgroundColor: '#3A913F', color: '#fff' } : { color: '#a1a1aa' }}
                >
                  {v === 'week' ? 'Week' : 'Maand'}
                </button>
              ))}
            </div>
          )}

          {/* Uitgeschakeld zolang het echte rooster niet gelezen kon worden:
              wat de modal dan toont is de fallback uit de code, en opslaan
              zou het echte rooster daarmee overschrijven. */}
          {isBeheer && (
            <button onClick={() => setShowConfig(true)}
              disabled={configFailed}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:border-zinc-800"
              title={configFailed ? 'Rooster kon niet geladen worden — configuratie tijdelijk niet beschikbaar' : 'Planning configuratie'}>
              <Settings size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Eerlijk zijn over waar je naar kijkt: zonder echt rooster zijn de
          namen en afdelingen hieronder een verouderde kopie uit de code, en
          dat is van buiten niet te zien. De planning zelf (de cellen) komt
          wel gewoon uit de database en blijft bruikbaar. */}
      {configFailed && (
        <div className="flex items-start gap-2 flex-shrink-0 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2">
          <TriangleAlert size={13} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-400">
            De namen- en afdelingenlijst kon niet geladen worden — je ziet een
            terugvallijst, die achterhaald kan zijn. De planning zelf is wel
            actueel. Herlaad de pagina; blijft dit staan, meld het dan even.
          </p>
        </div>
      )}

      {/* Het rooster-voorstel (zie effect 2). Beheer-only, en bewust hier in
          plaats van in de configuratiemodal: het is iets wat je wil zien
          zonder ernaar te gaan zoeken. Niets klikken verandert niets. */}
      {isBeheer && rosterProposal && (
        <div className="flex-shrink-0 rounded-xl border border-sky-900/40 bg-sky-950/20 overflow-hidden">
          <button
            onClick={() => setShowProposal(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sky-300"
          >
            <Users size={13} className="flex-shrink-0" />
            {rosterProposal.renames.length > 0
              ? `${rosterProposal.renames.length} naam${rosterProposal.renames.length === 1 ? '' : 'en'} te koppelen aan Team`
              : `${rosterProposal.additions.length} naam${rosterProposal.additions.length === 1 ? '' : 'en'} toe te voegen`}
            <span className="ml-auto text-sky-600">
              {showProposal ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          </button>
          {showProposal && (
            <div className="px-3 pb-2.5 space-y-2">
              <div className="space-y-0.5">
                {rosterProposal.renames.map(r => (
                  <p key={`r-${r.fromDept}|${r.fromEmp}`} className="text-xs text-zinc-300">
                    <span className="text-zinc-500">{r.fromDept}:</span> {r.fromEmp}
                    <span className="text-zinc-600"> → </span>{r.toEmp}
                  </p>
                ))}
                {rosterProposal.additions.map(a => (
                  <p key={`a-${a.dept}|${a.emp}`} className="text-xs text-zinc-300">
                    <span className="text-zinc-500">{a.dept}:</span> {a.emp}
                    <span className="text-zinc-600"> (nieuw)</span>
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500">
                Bestaande planning verhuist mee naar de nieuwe naam. Niets doen
                laat alles staan zoals het staat.
              </p>
              {proposalError && <p className="text-[10px] text-red-400">{proposalError}</p>}
              <button
                onClick={applyRosterProposal}
                disabled={applyingProposal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#3A913F' }}
              >
                {applyingProposal && <Loader2 size={12} className="animate-spin" />}
                Toepassen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs — Statistieken alleen zichtbaar met de planning_statistieken
          permissie (of voor beheerders) — geen aparte plek onder Beheer,
          gewoon een normale tab die je per persoon kan toekennen. */}
      <div className="flex items-center gap-1 border-b border-zinc-800 flex-shrink-0">
        {(canSeeStats ? (['mijn', 'team', 'stats'] as Tab[]) : (['mijn', 'team'] as Tab[])).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-sh-grey' : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
            style={tab === t ? { borderColor: '#3A913F' } : undefined}
          >
            {t === 'mijn' ? 'Mijn maand' : t === 'team' ? 'Team' : 'Statistieken'}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {tab === 'mijn' && (
          myPerson ? (
            <>
              <div className="flex justify-end pb-1.5">
                <button onClick={() => setShowNamePicker(true)} className="text-[11px] text-zinc-600 hover:text-zinc-300 underline">
                  Niet jij? Wissel van naam
                </button>
              </div>
              <div className="hidden lg:block h-full">
                <MyMonthWeeks
                  year={anchorYear}
                  month={anchorMonth}
                  dept={myPerson.dept}
                  emp={myPerson.emp}
                  data={data}
                  readOnly={!canEditCol(myPerson)}
                  presets={presets}
                  onApply={applyToTargets}
                  onClear={clearTargets}
                  emailToName={emailToName}
                />
              </div>
              <div className="lg:hidden">
                <MyMonthCalendar
                  year={anchorYear}
                  month={anchorMonth}
                  dept={myPerson.dept}
                  emp={myPerson.emp}
                  data={data}
                  readOnly={!canEditCol(myPerson)}
                  presets={presets}
                  onApply={applyToTargets}
                  onClear={clearTargets}
                  emailToName={emailToName}
                />
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-zinc-500">
              {/* Gated on emailMatchAttempted, not just identityLoaded — that
                  only means "checked localStorage", which resolves almost
                  instantly on every refresh, well before the real department
                  config has replaced the hardcoded fallback list. Without
                  this, a returning person whose identity lives only in the
                  synced config (not the fallback) would flash this message
                  for a moment on every reload before myPerson resolves. */}
              {identityLoaded && emailMatchAttempted ? 'Nog geen naam gekozen.' : 'Laden…'}
              {identityLoaded && emailMatchAttempted && (
                <button onClick={() => setShowNamePicker(true)} className="block mx-auto mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline">
                  Kies wie je bent
                </button>
              )}
            </div>
          )
        )}

        {tab === 'team' && (
          <>
            <div className="hidden lg:flex flex-col gap-3 h-full">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative max-w-xs flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    placeholder="Zoek een naam…"
                    className="w-full pl-8 pr-7 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                  {teamSearch && (
                    <button onClick={() => setTeamSearch('')} aria-label="Zoekopdracht wissen"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      <X size={13} />
                    </button>
                  )}
                </div>
                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
                    style={showArchived
                      ? { backgroundColor: 'rgba(58,145,63,0.12)', borderColor: '#3A913F', color: '#6ee7a0' }
                      : { backgroundColor: 'transparent', borderColor: '#27272a', color: '#71717a' }}
                  >
                    <Users size={12} />
                    {showArchived ? 'Verberg inactieve leden' : `Toon inactieve leden (${archivedCount})`}
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {teamViewMode === 'week' ? (
                  <WeekGrid
                    week={week}
                    people={visibleTeam}
                    data={data}
                    canEditCol={canEditCol}
                    presets={presets}
                    onApply={applyToTargets}
                    onClear={clearTargets}
                    groupHeaders
                    showNameColumn
                    variant="compact"
                    personSubtitle={p => p.dept}
                    prefsKey={myIdentity ?? undefined}
                    forceExpandSections={!!teamSearch.trim()}
                    emailToName={emailToName}
                  />
                ) : (
                  <TeamMonthGrid
                    year={anchorYear}
                    month={anchorMonth}
                    people={visibleTeam}
                    data={data}
                    canEditCol={canEditCol}
                    presets={presets}
                    onApply={applyToTargets}
                    onClear={clearTargets}
                    prefsKey={myIdentity ?? undefined}
                    forceExpandSections={!!teamSearch.trim()}
                    emailToName={emailToName}
                  />
                )}
              </div>
            </div>

            {/* Mobile is its own list-based surface, not a shrunk desktop
                grid — real scheduling apps (7shifts, Deputy, When I Work)
                deliberately never put the full team grid on a phone; they
                page through days with a date strip and keep bulk editing
                on web/desktop. MobileTeamDayStepper owns its own date-strip
                navigation and a per-person week drill-down internally. */}
            <div className="lg:hidden h-full">
              <MobileTeamDayStepper
                week={week}
                people={showArchived ? everyEmployee : activeEveryEmployee}
                data={data}
                canEditCol={canEditCol}
                presets={presets}
                onApply={applyToTargets}
                onClear={clearTargets}
                onNeedAdjacentWeek={dir => setWeekAnchor(a => addWeeks(a, dir))}
                emailToName={emailToName}
              />
            </div>
          </>
        )}

        {tab === 'stats' && canSeeStats && (
          <PlanningStats departments={activeDepts} archived={archived} presets={presets} />
        )}
      </div>

      {showNamePicker && (
        <NamePicker
          depts={pickableDepts}
          guess={nameGuess}
          onPick={confirmIdentity}
          onCancel={() => setShowNamePicker(false)}
          canCancel={!!myIdentity}
        />
      )}

      {showConfig && (
        <PlanningConfigModal
          departments={activeDepts}
          onSave={handleSaveConfig}
          archived={archived}
          onSaveArchived={handleSaveArchived}
          teamNames={teamContacts.map(c => c.name)}
          onRename={applyRenames}
          onClose={() => { setShowConfig(false); loadPresets() }}
          isBeheer={isBeheer}
        />
      )}
    </div>
  )
}
