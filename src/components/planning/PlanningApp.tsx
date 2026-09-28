'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Settings, Search, X } from 'lucide-react'
import { DEPARTMENTS, type Department } from '@/lib/planning-config'
import {
  addWeeks, dateCellKey, getWeekDates, groupWeekByMonth, weekDayCellKey, weekLabel,
  type CellData, type PlanningWeekData, type WeekDay,
} from '@/lib/planning-week'
import { isAdminUser } from '@/lib/auth-permissions'
import type { PlanningPreset } from '@/lib/planning-presets'
import PlanningConfigModal from './PlanningConfigModal'
import NamePicker from './NamePicker'
import WeekGrid, { type Person } from './WeekGrid'
import MobileMyWeekAgenda from './MobileMyWeekAgenda'
import MobileTeamDayStepper from './MobileTeamDayStepper'

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

type Tab = 'mijn' | 'team'

export default function PlanningApp() {
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('mijn')
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const week = useMemo(() => getWeekDates(weekAnchor), [weekAnchor])
  const isCurrentWeek = week.some(w => w.isToday)

  const [activeDepts, setActiveDepts] = useState<Department[]>(DEPARTMENTS)
  const [presets, setPresets] = useState<PlanningPreset[]>([])
  const [showConfig, setShowConfig] = useState(false)

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
    const candidates = [...new Set(everyEmployee.map(c => c.emp))].filter(emp => norm(emp).split(' ')[0] === myFirst)
    return candidates.length === 1 ? candidates[0] : null
  }, [myName, everyEmployee])

  // Ask once, only after we've actually checked localStorage and loaded the
  // roster — otherwise this would flash on every load before the stored
  // identity has had a chance to apply.
  useEffect(() => {
    if (identityLoaded && everyEmployee.length > 0 && !myIdentity && !myColumn) setShowNamePicker(true)
  }, [identityLoaded, everyEmployee, myIdentity, myColumn])

  function confirmIdentity(name: string) {
    setMyIdentity(name)
    try { localStorage.setItem('planning-my-name', name) } catch { /* ignore */ }
    setShowNamePicker(false)
  }

  const myPerson = useMemo(
    () => everyEmployee.find(p => p.emp === myIdentity) ?? null,
    [everyEmployee, myIdentity]
  )

  // ── Load the week's data ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const groups = groupWeekByMonth(week)
      const results = await Promise.all(groups.map(g =>
        supabase.from('planning_entries')
          .select('year, month, day, department, employee, value, bold, text_color, bg_color')
          .eq('year', g.year).eq('month', g.month).in('day', g.days)
      ))
      if (cancelled) return
      const map: PlanningWeekData = {}
      for (const res of results) {
        for (const r of res.data ?? []) {
          map[dateCellKey(r.year, r.month, r.day, r.department, r.employee)] = {
            value: r.value, bold: r.bold ?? true,
            textColor: r.text_color ?? '#ffffff', bgColor: r.bg_color ?? null,
          }
        }
      }
      setData(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week])

  // ── Apply / clear ────────────────────────────────────────────────────────
  async function applyToTargets(targets: { wd: WeekDay; dept: string; emp: string }[], cell: CellData) {
    setData(prev => {
      const next = { ...prev }
      for (const t of targets) next[weekDayCellKey(t.wd, t.dept, t.emp)] = cell
      return next
    })
    const rows = targets.map(t => ({
      year: t.wd.year, month: t.wd.month, day: t.wd.day, department: t.dept, employee: t.emp,
      value: cell.value, bold: cell.bold, text_color: cell.textColor, bg_color: cell.bgColor,
      updated_by: userEmail,
    }))
    await supabase.from('planning_entries').upsert(rows, { onConflict: 'year,month,day,department,employee' })
  }

  async function clearTargets(targets: { wd: WeekDay; dept: string; emp: string }[]) {
    setData(prev => {
      const next = { ...prev }
      for (const t of targets) delete next[weekDayCellKey(t.wd, t.dept, t.emp)]
      return next
    })
    await Promise.all(targets.map(t =>
      supabase.from('planning_entries').delete()
        .eq('year', t.wd.year).eq('month', t.wd.month).eq('day', t.wd.day)
        .eq('department', t.dept).eq('employee', t.emp)
    ))
  }

  function goToToday() { setWeekAnchor(new Date()) }

  const visibleTeam: Person[] = useMemo(() => {
    if (!teamSearch.trim()) return everyEmployee
    const q = norm(teamSearch)
    return everyEmployee.filter(p => norm(p.emp).includes(q))
  }, [everyEmployee, teamSearch])

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Week navigation — shared by both tabs */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button onClick={() => setWeekAnchor(a => addWeeks(a, -1))} aria-label="Vorige week"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-sm font-semibold text-sh-grey min-w-[180px] text-center">{weekLabel(week)}</span>
        <button onClick={() => setWeekAnchor(a => addWeeks(a, 1))} aria-label="Volgende week"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
          <ChevronRight size={15} />
        </button>
        {!isCurrentWeek && (
          <button onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-sh-grey hover:border-zinc-700 transition-colors">
            Vandaag
          </button>
        )}
        {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}

        {isBeheer && (
          <button onClick={() => setShowConfig(true)}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            title="Planning configuratie">
            <Settings size={15} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 flex-shrink-0">
        {(['mijn', 'team'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-sh-grey' : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
            style={tab === t ? { borderColor: '#3A913F' } : undefined}
          >
            {t === 'mijn' ? 'Mijn week' : 'Team'}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {tab === 'mijn' && (
          myPerson ? (
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
              <div className="relative max-w-xs flex-shrink-0">
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
                />
              </div>
            </div>
            <div className="lg:hidden">
              <MobileTeamDayStepper
                week={week}
                people={everyEmployee}
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
          depts={activeDepts}
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
          onClose={() => setShowConfig(false)}
          isBeheer={isBeheer}
        />
      )}
    </div>
  )
}
