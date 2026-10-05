'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import type { Person } from './WeekGrid'
import DayEditor from './DayEditor'

// Mobile version of "Team" — deliberately its own list-based surface, not a
// shrunk desktop grid. Confirmed against how real scheduling apps do this
// (Deputy, When I Work, 7shifts): none of them put the full people×days
// grid on mobile, or use drag-select on touch — they page through with a
// tappable date strip and keep dense grid-building on web/desktop.
//
// Two screens live here: the day-stepper (default — everyone's status for
// one tapped day) and a per-person drill-down (tap the arrow on a row to
// see that person's whole week as a list) for the "zoom out and spot a
// stretch" need the old Week/Month grids covered on desktop.
export default function MobileTeamDayStepper({
  week, people, data, canEditCol, presets, onApply, onClear, onNeedAdjacentWeek, emailToName,
}: {
  week: WeekDay[]
  people: Person[]
  data: PlanningWeekData
  canEditCol: (p: Person) => boolean
  presets: PlanningPreset[]
  onApply: (targets: { wd: WeekDay; dept: string; emp: string }[], value: CellData) => void
  onClear: (targets: { wd: WeekDay; dept: string; emp: string }[]) => void
  onNeedAdjacentWeek: (direction: 1 | -1) => void
  emailToName?: Map<string, string>
}) {
  const [dayIdx, setDayIdx] = useState(() => Math.max(0, week.findIndex(w => w.isToday)))
  const pendingEdgeRef = useRef<'start' | 'end' | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ wd: WeekDay; dept: string; emp: string } | null>(null)
  const [drilldown, setDrilldown] = useState<Person | null>(null)

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

  if (drilldown) {
    const locked = !canEditCol(drilldown)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setDrilldown(null)} aria-label="Terug"
            className="tap-target w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sh-grey truncate">{drilldown.emp}</p>
            <p className="text-[11px] text-zinc-500 truncate">{drilldown.dept}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {week.map(day => {
            const key = weekDayCellKey(day, drilldown.dept, drilldown.emp)
            const cell = data[key] ?? emptyCell()
            return (
              <button
                key={key}
                onClick={() => !locked && setEditing({ wd: day, dept: drilldown.dept, emp: drilldown.emp })}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-left"
                style={{ opacity: locked ? 0.6 : 1 }}
              >
                <span className={`w-16 flex-shrink-0 text-xs ${day.isToday ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}`}>
                  {day.dayName.slice(0, 2).toUpperCase()} {day.day}
                </span>
                {cell.value ? (
                  <span
                    className="flex-1 min-w-0 truncate rounded-md px-2 py-1 text-xs font-semibold"
                    style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                  >
                    {cell.value}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-600">—</span>
                )}
                {cell.note && <span className="flex-shrink-0 max-w-[30%] truncate text-[10px] text-zinc-500">{cell.note}</span>}
              </button>
            )
          })}
        </div>

        {editing && (
          <DayEditor
            title={`${editing.wd.dayName} ${editing.wd.day} ${DUTCH_MONTHS[editing.wd.month - 1]}`}
            subtitle={`${editing.emp} — ${editing.dept}`}
            initialCell={data[weekDayCellKey(editing.wd, editing.dept, editing.emp)] ?? emptyCell()}
            presets={presets}
            readOnly={!canEditCol(editing)}
            emailToName={emailToName}
            onSave={cell => { onApply([editing], cell); setEditing(null) }}
            onClear={() => { onClear([editing]); setEditing(null) }}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={goPrev} aria-label="Vorige dag"
          className="tap-target w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
          <ChevronLeft size={15} />
        </button>
        {/* Tap any day to jump straight to it — replacing "step one day at
            a time" with the same "tap the days at the top" pattern
            7shifts' mobile schedule uses. Still just the loaded week;
            stepping past either edge with the arrows loads the next one. */}
        <div className="grid grid-cols-7 gap-1 flex-1">
          {week.map((day, i) => (
            <button
              key={`${day.year}-${day.month}-${day.day}`}
              onClick={() => setDayIdx(i)}
              className="tap-target flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg transition-colors"
              style={{
                backgroundColor: i === dayIdx ? '#3A913F' : day.isToday ? 'rgba(58,145,63,0.12)' : 'transparent',
              }}
            >
              <span className={`text-[9px] uppercase tracking-wide ${i === dayIdx ? 'text-white/80' : 'text-zinc-500'}`}>
                {day.dayName.slice(0, 2)}
              </span>
              <span className={`text-xs font-semibold ${i === dayIdx ? 'text-white' : day.isToday ? 'text-emerald-400' : 'text-zinc-300'}`}>
                {day.day}
              </span>
            </button>
          ))}
        </div>
        <button onClick={goNext} aria-label="Volgende dag"
          className="tap-target w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
          <ChevronRight size={15} />
        </button>
      </div>
      <p className={`text-center text-xs -mt-1 ${wd.isToday ? 'text-emerald-400 font-medium' : 'text-zinc-500'}`}>
        {wd.dayName} {wd.day} {DUTCH_MONTHS[wd.month - 1]}
      </p>

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
                const locked = !canEditCol(person)
                return (
                  <div
                    key={key}
                    className="w-full flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60"
                    style={{ opacity: locked ? 0.6 : 1 }}
                  >
                    <button
                      onClick={() => setEditing({ wd, dept: person.dept, emp: person.emp })}
                      className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left"
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
                    {/* Zoom out for this one person — this week as a list,
                        replacing the old desktop Week/Month grids' "spot a
                        stretch" job without needing a grid on a phone. */}
                    <button
                      onClick={() => setDrilldown(person)}
                      aria-label={`Bekijk de week van ${person.emp}`}
                      className="tap-target flex-shrink-0 w-9 h-9 flex items-center justify-center text-zinc-600 hover:text-zinc-300 mr-1"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
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
          readOnly={!canEditCol(editing)}
          emailToName={emailToName}
          onSave={cell => { onApply([editing], cell); setEditing(null) }}
          onClear={() => { onClear([editing]); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
