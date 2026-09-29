'use client'

import { useState } from 'react'
import { DUTCH_MONTHS, getDaysInMonth } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }

// "Mijn maand" — a read-mostly overview of a whole month, one person at a
// time (always you, from Mijn week). For spotting a stretch of Verlof days
// or checking "what does this month look like" at a glance; day-to-day
// editing still happens via the exact same DayEditor as the week view.
export default function MyMonthCalendar({
  year, month, dept, emp, data, readOnly, presets, onApply, onClear, emailToName,
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
  emailToName?: Map<string, string>
}) {
  const days = getDaysInMonth(year, month)
  const leadingBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const [editingDay, setEditingDay] = useState<number | null>(null)

  function wdFor(day: number): WeekDay {
    const d = days.find(x => x.day === day)!
    return { date: new Date(year, month - 1, day), year, month, day, dayName: d.dayName, isWeekend: d.isWeekend, isToday: d.isToday }
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map(d => (
          <span key={d} className="text-[10px] text-zinc-600 text-center uppercase tracking-wide">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {days.map(d => {
          const key = dateCellKey(year, month, d.day, dept, emp)
          const cell = data[key] ?? emptyCell()
          return (
            <button
              key={d.day}
              onClick={() => !readOnly && setEditingDay(d.day)}
              className="aspect-square rounded-lg border p-1.5 flex flex-col items-start gap-1 text-left transition-colors hover:brightness-110"
              style={{
                backgroundColor: d.isToday ? 'rgba(58,145,63,0.08)' : 'rgba(255,255,255,0.02)',
                borderColor: d.isToday ? 'rgba(58,145,63,0.35)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <span className={`text-[11px] ${d.isToday ? 'text-emerald-400 font-semibold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'}`}>
                {d.day}
              </span>
              {cell.value && (
                <span
                  className="w-full truncate rounded px-1 py-0.5 text-[9px] font-semibold"
                  style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.1)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                >
                  {cell.value}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {editingDay !== null && (
        <DayEditor
          title={`${wdFor(editingDay).dayName} ${editingDay} ${DUTCH_MONTHS[month - 1]}`}
          initialCell={data[dateCellKey(year, month, editingDay, dept, emp)] ?? emptyCell()}
          presets={presets}
          readOnly={readOnly}
          emailToName={emailToName}
          onSave={cell => { onApply([{ wd: wdFor(editingDay), dept, emp }], cell); setEditingDay(null) }}
          onClear={() => { onClear([{ wd: wdFor(editingDay), dept, emp }]); setEditingDay(null) }}
          onClose={() => setEditingDay(null)}
        />
      )}
    </div>
  )
}
