'use client'

import { useEffect, useRef, useState } from 'react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, getMonthWeeks, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }

// Desktop-only "Mijn maand": the whole month as full calendar weeks stacked
// on top of each other, each week rendered like a Mijn-week row — same cell
// size, same header style — instead of a cramped small-day grid. Auto-
// scrolls to the current week on first load. Mobile keeps the old compact
// day-grid (MyMonthCalendar) — a 7-wide spacious row doesn't fit a phone.
export default function MyMonthWeeks({
  year, month, dept, emp, data, readOnly, presets, onApply, onClear,
}: {
  year: number
  month: number
  dept: string
  emp: string
  data: PlanningWeekData
  readOnly: boolean
  presets: PlanningPreset[]
  onApply: (targets: Target[], value: CellData) => void
  onClear: (targets: Target[]) => void
}) {
  const weeks = getMonthWeeks(year, month)
  const [editing, setEditing] = useState<{ wd: WeekDay; cell: CellData } | null>(null)
  const todayRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
  }, [year, month])

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-zinc-800">
      {weeks.map((week, wi) => {
        const containsToday = week.some(wd => wd.isToday)
        return (
          <div key={wi} ref={containsToday ? todayRowRef : undefined}>
            <div className="grid grid-cols-7" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              {week.map(wd => (
                <div
                  key={`h-${wd.year}-${wd.month}-${wd.day}`}
                  style={{ backgroundColor: wd.isToday ? '#111d11' : '#161616' }}
                  className="border-b border-r border-zinc-800 px-2 py-2 text-center last:border-r-0"
                >
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{wd.dayName.slice(0, 2)}</p>
                  <p className={`text-sm font-semibold ${wd.isToday ? 'text-emerald-400' : 'text-zinc-300'}`}>{wd.day}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {week.map(wd => {
                const key = weekDayCellKey(wd, dept, emp)
                const cell = data[key] ?? emptyCell()
                return (
                  <button
                    key={key}
                    onClick={() => !readOnly && setEditing({ wd, cell })}
                    disabled={readOnly}
                    style={{ backgroundColor: wd.isToday ? 'rgba(58,145,63,0.06)' : undefined }}
                    className={`relative border-b border-r border-zinc-800/60 last:border-r-0 p-3 min-h-[76px] flex flex-col items-center justify-center gap-0.5 ${readOnly ? '' : 'cursor-pointer hover:brightness-110'}`}
                  >
                    {cell.value ? (
                      <>
                        <span
                          className="w-full text-center truncate rounded-md px-1.5 py-1 text-[11px] font-semibold"
                          style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                        >
                          {cell.value}
                        </span>
                        {cell.note && (
                          <span className="w-full text-center truncate text-[9px] text-zinc-500 px-1">{cell.note}</span>
                        )}
                      </>
                    ) : (
                      !readOnly && <span className="text-zinc-700 text-xs">+</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {editing && (
        <DayEditor
          title={`${editing.wd.dayName} ${editing.wd.day} ${DUTCH_MONTHS[editing.wd.month - 1]}`}
          initialCell={editing.cell}
          presets={presets}
          readOnly={readOnly}
          onSave={cell => { onApply([{ wd: editing.wd, dept, emp }], cell); setEditing(null) }}
          onClear={() => { onClear([{ wd: editing.wd, dept, emp }]); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
