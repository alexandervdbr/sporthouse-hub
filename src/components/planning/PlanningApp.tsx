'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Settings, Search, X, Users } from 'lucide-react'
import { DEPARTMENTS, DUTCH_MONTHS, UNASSIGNED_DEPT, normName, type Department } from '@/lib/planning-config'
import {
  addMonths, addWeeks, dateCellKey, getMonthWeeks, getWeekDates, groupWeekByMonth, weekDayCellKey, weekLabel,
  type CellData, type PlanningWeekData, type WeekDay,
} from '@/lib/planning-week'
import { isAdminUser } from '@/lib/auth-permissions'
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

const SELECT_COLS = 'year, month, day, department, employee, value, bold, text_color, bg_color, note, updated_by, updated_at'

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
const CONFIG_CACHE_KEY = 'planning-config-cache'

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
  // "Mijn" is always the month view now — a people × 7-day grid reduced to
  // a whole month wouldn't fit Team at that density (the original
  // too-dense problem this redesign exists to fix), so Team's month view
  // (below) is a separate, deliberately compact overview rather than the
  // primary editing surface — the week view stays that. Desktop only;
  // mobile always gets the week-based day-stepper regardless of this.
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

  // Mobile always shows Team's week-based day-stepper regardless of
  // teamViewMode (a stored 'month' preference could otherwise follow
  // someone from a desktop session onto a narrow viewport where there's no
  // month view to show), so the shared nav bar needs to know the actual
  // viewport, not just the toggle's last setting.
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

  const [myIdentity, setMyIdentity] = useState<string | null>(null)
  const [showNamePicker, setShowNamePicker] = useState(false)
  const [identityLoaded, setIdentityLoaded] = useState(false)

  const [teamSearch, setTeamSearch] = useState('')

  // ── Load departments config ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/planning/config')
      .then(r => r.json())
      .then((cfg: Department[] | null) => {
        if (Array.isArray(cfg) && cfg.length > 0) {
          setActiveDepts(cfg)
          try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg)) } catch { /* private browsing */ }
        }
      })
      .catch(() => { /* fall back to the cached or hardcoded config */ })
      .finally(() => setConfigLoaded(true))
  }, [])

  async function handleSaveConfig(newDepts: Department[]) {
    await fetch('/api/planning/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDepts),
    })
    setActiveDepts(newDepts)
    try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(newDepts)) } catch { /* private browsing */ }
  }

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

  // 1) Exact duplicate names anywhere in the saved config (case/accent-
  // insensitive) — e.g. the same name saved twice by the double-save race
  // above before this lock existed.
  useEffect(() => {
    if (!isBeheer || activeDepts.length === 0 || configWriteRef.current) return
    const seen = new Set<string>()
    let changed = false
    const next = activeDepts.map(d => {
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
  }, [isBeheer, activeDepts])

  // 2) A long-standing manual-entry convention here stores lots of people as
  // a bare first name only ("Yaro", "Tim", …) rather than a full name — this
  // resolves every one of those against the real Team contact it means,
  // renaming it in place. When a first name matches more than one Team
  // contact (two people both named "Jelle", "Thijs", …), a per-name
  // override (declared at module scope so its reference is stable across
  // renders) says which surname goes to which department; anything
  // ambiguous with no override is left untouched (still flagged "niet in
  // team" — a genuine remaining conflict to sort out manually) rather than
  // guessing wrong.
  useEffect(() => {
    if (!isBeheer || teamContacts.length === 0 || activeDepts.length === 0 || configWriteRef.current) return
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
          if (matches[0].name !== emp) { dept.employees[i] = matches[0].name; changed = true }
          continue
        }
        const override = AMBIGUOUS_FIRST_NAME_OVERRIDES[firstNorm]
        if (!override) continue // ambiguous, no known resolution — leave flagged
        const here = override.find(o => o.dept === dept.name)
        if (!here) continue // this slot's department isn't one of the overrides — leave it
        const contact = matches.find(c => normName(c.name.trim().split(/\s+/)[1] ?? '').startsWith(here.surnamePrefix))
        if (contact && contact.name !== emp) { dept.employees[i] = contact.name; changed = true }
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
        changed = true
      }
    }

    if (!changed) return
    configWriteRef.current = true
    handleSaveConfig(next).finally(() => { configWriteRef.current = false })
  }, [isBeheer, teamContacts, activeDepts])

  // 3) New Team contacts land in a "Nieuw" bucket automatically. Someone
  // already represented by a bare first name (see above) counts as known —
  // otherwise this would just recreate the exact duplicates effect 2 cleans
  // up. Trade-off: a genuinely new person who happens to share a first name
  // with an existing bare entry won't be auto-added either; same as any
  // other name-only match in this feature, that's a manual add.
  useEffect(() => {
    if (!isBeheer || teamContacts.length === 0 || activeDepts.length === 0 || configWriteRef.current) return
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
  }, [isBeheer, teamContacts, activeDepts])

  // ── Load presets ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/planning/presets').then(r => r.json()).then(setPresets).catch(() => {})
  }, [])

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

  const canEditCol = useCallback((emp: string): boolean => {
    if (canEditAll) return true
    if (myColumn === '__none__') return false
    if (myColumn === null) return true
    return myColumn === emp
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('planning-my-name')
      if (stored) setMyIdentity(stored)
    } catch { /* private browsing */ }
    setIdentityLoaded(true)
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
  const [emailMatchAttempted, setEmailMatchAttempted] = useState(false)
  useEffect(() => {
    if (!authChecked || !teamContactsLoaded || !configLoaded) return
    if (myIdentity || myColumn) { setEmailMatchAttempted(true); return }
    if (userEmail) {
      const wanted = userEmail.trim().toLowerCase()
      const match = teamContacts.find(c => c.email && c.email.trim().toLowerCase() === wanted)
      if (match && activeEveryEmployee.some(p => p.emp === match.name)) {
        setMyIdentity(match.name)
        try { localStorage.setItem('planning-my-name', match.name) } catch { /* ignore */ }
      }
    }
    setEmailMatchAttempted(true)
  }, [authChecked, teamContactsLoaded, configLoaded, userEmail, teamContacts, myIdentity, myColumn, activeEveryEmployee])

  const nameGuess = useMemo(() => {
    if (!myName) return null
    const myFirst = norm(myName).split(' ')[0]
    if (!myFirst) return null
    const candidates = [...new Set(activeEveryEmployee.map(c => c.emp))].filter(emp => norm(emp).split(' ')[0] === myFirst)
    return candidates.length === 1 ? candidates[0] : null
  }, [myName, activeEveryEmployee])

  // Ask once, only after we've actually checked localStorage, attempted the
  // email match above, and loaded the roster — otherwise this would flash
  // on every load before either has had a chance to apply.
  useEffect(() => {
    if (identityLoaded && emailMatchAttempted && activeEveryEmployee.length > 0 && !myIdentity && !myColumn) setShowNamePicker(true)
  }, [identityLoaded, emailMatchAttempted, activeEveryEmployee, myIdentity, myColumn])

  function confirmIdentity(name: string) {
    setMyIdentity(name)
    try { localStorage.setItem('planning-my-name', name) } catch { /* ignore */ }
    setShowNamePicker(false)
  }

  const myPerson = useMemo(
    () => everyEmployee.find(p => p.emp === myIdentity) ?? null,
    [everyEmployee, myIdentity]
  )

  // "Mijn maand" renders full calendar weeks (see getMonthWeeks), so the
  // first/last week can spill into the neighboring month — those overflow
  // days need their data loaded too, not just the target month's own days.
  const daysToLoad = usingWeekNav ? week : getMonthWeeks(anchorYear, anchorMonth).flat()

  // Bumped whenever the tab regains visibility (see the realtime effect
  // below) purely to force the load effect just below to re-run — an
  // independent safety net so coming back to the tab always refetches,
  // regardless of whether the realtime socket caught everything meanwhile.
  const [refreshTick, setRefreshTick] = useState(0)

  // ── Load the visible period's data (a week, or a whole month) ───────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const results = await Promise.all(groupWeekByMonth(daysToLoad).map(g =>
        supabase.from('planning_entries').select(SELECT_COLS).eq('year', g.year).eq('month', g.month).in('day', g.days)
      ))
      if (cancelled) return
      const map: PlanningWeekData = {}
      for (const res of results) {
        for (const r of res.data ?? []) {
          map[dateCellKey(r.year, r.month, r.day, r.department, r.employee)] = {
            value: r.value, bold: r.bold ?? true,
            textColor: r.text_color ?? '#ffffff', bgColor: r.bg_color ?? null,
            note: r.note ?? null,
            updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null,
          }
        }
      }
      setData(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // refreshTick has no real value of its own — bumping it is just a way to
    // force this effect to re-run (a fresh refetch) when the tab regains
    // visibility, as a safety net independent of whether the realtime
    // socket below actually caught everything while backgrounded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingWeekNav, week, anchorYear, anchorMonth, refreshTick])

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
            // Temporary, deliberately loud diagnostic — confirms whether an
            // event actually reaches this browser tab at all, as opposed to
            // a delivery/RLS gap upstream that the "SUBSCRIBED" status
            // alone can't reveal (a channel can join successfully and still
            // never receive a specific row's events).
            console.log('Planning live-sync ontving:', payload.eventType, payload.new ?? payload.old)
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { year: number; month: number; day: number; department: string; employee: string }
              setData(prev => {
                const next = { ...prev }
                delete next[dateCellKey(old.year, old.month, old.day, old.department, old.employee)]
                return next
              })
              return
            }
            const row = payload.new as {
              year: number; month: number; day: number; department: string; employee: string
              value: string; bold: boolean | null; text_color: string | null; bg_color: string | null; note: string | null
              updated_by: string | null; updated_at: string | null
            }
            setData(prev => ({
              ...prev,
              [dateCellKey(row.year, row.month, row.day, row.department, row.employee)]: {
                value: row.value, bold: row.bold ?? true,
                textColor: row.text_color ?? '#ffffff', bgColor: row.bg_color ?? null,
                note: row.note ?? null,
                updatedBy: row.updated_by ?? null, updatedAt: row.updated_at ?? null,
              },
            }))
          }
        )
        .subscribe((status, err) => {
          if (thisChannel !== current) return // superseded — ignore
          if (status === 'SUBSCRIBED') {
            backoff = 2000
            console.log('Planning live-sync verbonden om', new Date().toLocaleTimeString())
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

    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      backoff = 2000
      reconnect()
      setRefreshTick(t => t + 1)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
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
    const toUpsert = entries.filter(e => e.cell)
    const toDelete = entries.filter(e => !e.cell)
    if (toUpsert.length > 0) {
      const rows = toUpsert.map(e => ({
        year: e.wd.year, month: e.wd.month, day: e.wd.day, department: e.dept, employee: e.emp,
        value: e.cell!.value, bold: e.cell!.bold, text_color: e.cell!.textColor, bg_color: e.cell!.bgColor, note: e.cell!.note,
        updated_by: userEmail, updated_at: new Date().toISOString(),
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

          {isBeheer && (
            <button onClick={() => setShowConfig(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
              title="Planning configuratie">
              <Settings size={15} />
            </button>
          )}
        </div>
      </div>

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
                  readOnly={!canEditCol(myPerson.emp)}
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
                  readOnly={!canEditCol(myPerson.emp)}
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
            <div className="lg:hidden">
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
          onClose={() => setShowConfig(false)}
          isBeheer={isBeheer}
        />
      )}
    </div>
  )
}
