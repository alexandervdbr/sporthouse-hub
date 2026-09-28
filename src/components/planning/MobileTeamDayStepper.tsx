'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import type { Person } from './WeekGrid'
import DayEditor from './DayEditor'

// Mobile version of "Team" — a people × 7-day grid genuinely doesn't fit a
// phone width at any density, so this steps one day at a time instead:
// same data, same edit access, just shaped for the screen. Stepping past
// either edge of the currently-loaded week asks the parent to load the
// adjacent week and lands on the matching edge day once it arrives.
export default function MobileTeamDayStepper({
  week, people, data, canEditCol, presets, onApply, onClear, onNeedAdjacentWeek,
}: {
  week: WeekDay[]
  people: Person[]
  data: PlanningWeekData
  canEditCol: (emp: string) => boolean
  presets: PlanningPreset[]
  onApply: (targets: { wd: WeekDay; dept: string; emp: string }[], value: CellData) => void
  onClear: (targets: { wd: WeekDay; dept: string; emp: string }[]) => void
  onNeedAdjacentWeek: (direction: 1 | -1) => void
}) {
  const [dayIdx, setDayIdx] = useState(() => Math.max(0, week.findIndex(w => w.isToday)))
  const pendingEdgeRef = useRef<'start' | 'end' | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ wd: WeekDay; dept: string; emp: string } | null>(null)

  useEffect(() => {
    if (pendingEdgeRef.current === 'start') { setDayIdx(6); pendingEdgeRef.current = null }
    else if (pendingEdgeRef.current === 'end') { setDayIdx(0); pendingEdgeRef.current = null }
  }, [week])

  function goPrev() {
    if (dayIdx === 0) { pendingEdgeRef.current = 'start'; onNeedAdjacentWeek(-1) } else setDayIdx(i => i - 1)
  }
  function goNext() {
    if (dayIdx === 6) { pendingEdgeRef.current = 'end'; onNeedAdjacentWeek(1) } else setDayIdx(i => i + 1)
  }

  const wd = week[dayIdx]
  const q = search.trim().toLowerCase()
  const groups = people.reduce<Record<string, Person[]>>((acc, p) => {
    if (q && !p.emp.toLowerCase().includes(q)) return acc
    ;(acc[p.dept] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-shrink-0">
        <button onClick={goPrev} aria-label="Vorige dag"
          className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
          <ChevronLeft size={16} />
        </button>
        <span className={`text-sm font-semibold ${wd.isToday ? 'text-emerald-400' : 'text-sh-grey'}`}>
          {wd.dayName} {wd.day} {DUTCH_MONTHS[wd.month - 1]}
        </span>
        <button onClick={goNext} aria-label="Volgende dag"
          className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="relative flex-shrink-0">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek een naam…"
          className="w-full pl-8 pr-7 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} aria-label="Zoekopdracht wissen"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(groups).map(([dept, deptPeople]) => (
          <div key={dept}>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5 px-1">{dept}</p>
            <div className="space-y-1.5">
              {deptPeople.map(person => {
                const key = weekDayCellKey(wd, person.dept, person.emp)
                const cell = data[key] ?? emptyCell()
                const locked = !canEditCol(person.emp)
                return (
                  <button
                    key={key}
                    onClick={() => setEditing({ wd, dept: person.dept, emp: person.emp })}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-left"
                    style={{ opacity: locked ? 0.6 : 1 }}
                  >
                    <span className="flex-1 text-sm font-medium text-zinc-200 truncate">{person.emp}</span>
                    {cell.value ? (
                      <div className="max-w-[45%] space-y-0.5">
                        <span
                          className="block truncate rounded-md px-2 py-1 text-[11px] font-semibold"
                          style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                        >
                          {cell.value}
                        </span>
                        {cell.note && <span className="block truncate text-[9px] text-zinc-500 text-right px-0.5">{cell.note}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {Object.keys(groups).length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-600">Niemand gevonden voor &ldquo;{search}&rdquo;.</p>
        )}
      </div>

      {editing && (
        <DayEditor
          title={`${editing.wd.dayName} ${editing.wd.day} ${DUTCH_MONTHS[editing.wd.month - 1]}`}
          subtitle={`${editing.emp} — ${editing.dept}`}
          initialCell={data[weekDayCellKey(editing.wd, editing.dept, editing.emp)] ?? emptyCell()}
          presets={presets}
          readOnly={!canEditCol(editing.emp)}
          onSave={cell => { onApply([editing], cell); setEditing(null) }}
          onClear={() => { onClear([editing]); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
