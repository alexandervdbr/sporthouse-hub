'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Settings, Search, X, Users } from 'lucide-react'
import { DEPARTMENTS, DUTCH_MONTHS, type Department } from '@/lib/planning-config'
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
import MobileMyWeekAgenda from './MobileMyWeekAgenda'
import MobileTeamDayStepper from './MobileTeamDayStepper'

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

type Tab = 'mijn' | 'team'
type ViewMode = 'week' | 'month'

const SELECT_COLS = 'year, month, day, department, employee, value, bold, text_color, bg_color, note'

export default function PlanningApp() {
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('mijn')
  // Month view is only offered on "Mijn week" — a people × 7-day grid
  // reduced to a whole month for Team would just recreate the original
  // too-dense-to-use problem this redesign exists to fix. Maand is the
  // default landing view (overridden below by whatever's remembered from a
  // previous visit).
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  // Remembered across refreshes/visits — read after mount (same pattern as
  // the identity lookup below) so this stays in sync even if it changes in
  // another tab.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('planning-view-mode')
      if (stored === 'week' || stored === 'month') setViewMode(stored)
    } catch { /* private browsing */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('planning-view-mode', viewMode) } catch { /* private browsing */ }
  }, [viewMode])

  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const week = useMemo(() => getWeekDates(weekAnchor), [weekAnchor])
  const isCurrentWeek = week.some(w => w.isToday)
  const anchorYear = weekAnchor.getFullYear()
  const anchorMonth = weekAnchor.getMonth() + 1
  const isCurrentMonth = anchorYear === new Date().getFullYear() && anchorMonth === new Date().getMonth() + 1
  const periodLabel = viewMode === 'month' ? `${DUTCH_MONTHS[anchorMonth - 1]} ${anchorYear}` : weekLabel(week)

  const [activeDepts, setActiveDepts] = useState<Department[]>(DEPARTMENTS)
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

  const [myIdentity, setMyIdentity] = useState<string | null>(null)
  const [showNamePicker, setShowNamePicker] = useState(false)
  const [identityLoaded, setIdentityLoaded] = useState(false)

  const [teamSearch, setTeamSearch] = useState('')

  // ── Load departments config ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/planning/config')
      .then(r => r.json())
      .then((cfg: Department[] | null) => { if (Array.isArray(cfg) && cfg.length > 0) setActiveDepts(cfg) })
      .catch(() => { /* fall back to hardcoded DEPARTMENTS */ })
  }, [])

  async function handleSaveConfig(newDepts: Department[]) {
    await fetch('/api/planning/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDepts),
    })
    setActiveDepts(newDepts)
  }

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
      if (!user) return
      setUserEmail(user.email ?? undefined)
      setMyName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
      const permsObj = user.app_metadata?.permissions ?? null
      const sections: string[] = permsObj?.sections ?? []
      const admin = isAdminUser(user)
      setIsBeheer(admin)
      if (admin || permsObj === null || sections.includes('planning_volledig')) {
        setCanEditAll(true)
      } else {
        setCanEditAll(false)
        setMyColumn(permsObj.planning_column ?? null)
      }
    })
  }, [])

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

  const nameGuess = useMemo(() => {
    if (!myName) return null
    const myFirst = norm(myName).split(' ')[0]
    if (!myFirst) return null
    const candidates = [...new Set(activeEveryEmployee.map(c => c.emp))].filter(emp => norm(emp).split(' ')[0] === myFirst)
    return candidates.length === 1 ? candidates[0] : null
  }, [myName, activeEveryEmployee])

  // Ask once, only after we've actually checked localStorage and loaded the
  // roster — otherwise this would flash on every load before the stored
  // identity has had a chance to apply.
  useEffect(() => {
    if (identityLoaded && activeEveryEmployee.length > 0 && !myIdentity && !myColumn) setShowNamePicker(true)
  }, [identityLoaded, activeEveryEmployee, myIdentity, myColumn])

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
  const daysToLoad = viewMode === 'month' ? getMonthWeeks(anchorYear, anchorMonth).flat() : week

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
          }
        }
      }
      setData(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, week, anchorYear, anchorMonth])

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
  function goPrev() { setWeekAnchor(a => viewMode === 'month' ? addMonths(a, -1) : addWeeks(a, -1)) }
  function goNext() { setWeekAnchor(a => viewMode === 'month' ? addMonths(a, 1) : addWeeks(a, 1)) }
  const isCurrentPeriod = viewMode === 'month' ? isCurrentMonth : isCurrentWeek

  const visibleTeam: Person[] = useMemo(() => {
    const pool = showArchived ? everyEmployee : activeEveryEmployee
    if (!teamSearch.trim()) return pool
    const q = norm(teamSearch)
    return pool.filter(p => norm(p.emp).includes(q))
  }, [everyEmployee, activeEveryEmployee, showArchived, teamSearch])

  const archivedCount = everyEmployee.length - activeEveryEmployee.length

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Period navigation — shared by both tabs */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button onClick={goPrev} aria-label={viewMode === 'month' ? 'Vorige maand' : 'Vorige week'}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <MiniCalendarPicker anchor={weekAnchor} onSelect={setWeekAnchor} label={periodLabel} />
        <button onClick={goNext} aria-label={viewMode === 'month' ? 'Volgende maand' : 'Volgende week'}
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

        <div className="ml-auto flex items-center gap-2">
          {/* Month view only makes sense for one person at a time — see the
              comment on viewMode's declaration. */}
          {tab === 'mijn' && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
              {(['week', 'month'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={viewMode === v ? { backgroundColor: '#3A913F', color: '#fff' } : { color: '#a1a1aa' }}
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 flex-shrink-0">
        {(['mijn', 'team'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'team') setViewMode('week') }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-sh-grey' : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
            style={tab === t ? { borderColor: '#3A913F' } : undefined}
          >
            {t === 'mijn' ? (viewMode === 'month' ? 'Mijn maand' : 'Mijn week') : 'Team'}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {tab === 'mijn' && (
          myPerson ? (
            viewMode === 'month' ? (
              <>
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
                  />
                </div>
              </>
            ) : (
              <>
                <div className="hidden lg:block h-full">
                  <WeekGrid
                    week={week}
                    people={[myPerson]}
                    data={data}
                    canEditCol={canEditCol}
                    presets={presets}
                    onApply={applyToTargets}
                    onClear={clearTargets}
                    groupHeaders={false}
                    showNameColumn={false}
                    variant="spacious"
                  />
                </div>
                <div className="lg:hidden">
                  <MobileMyWeekAgenda
                    week={week}
                    dept={myPerson.dept}
                    emp={myPerson.emp}
                    data={data}
                    readOnly={!canEditCol(myPerson.emp)}
                    presets={presets}
                    onApply={applyToTargets}
                    onClear={clearTargets}
                  />
                </div>
              </>
            )
          ) : (
            <div className="py-12 text-center text-sm text-zinc-500">
              {identityLoaded ? 'Nog geen naam gekozen.' : 'Laden…'}
              {identityLoaded && (
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
                />
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
              />
            </div>
          </>
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
          onClose={() => setShowConfig(false)}
          isBeheer={isBeheer}
        />
      )}
    </div>
  )
}
