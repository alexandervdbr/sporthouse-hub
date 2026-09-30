'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }

const SEL_BG = 'rgba(59,130,246,0.12)'
const SEL_BORDER = '#3b82f6'

// Mobile's own "Mijn maand". Went through two rounds here — a drag-select
// grid (felt like fighting touch with a mouse gesture) and a dot-grid +
// separate list (the dots didn't carry enough meaning, and the tiny
// checkbox felt like a decoration, not something to trust tapping) —
// confirmed against feedback both times. This version is a single
// scrollable list: every day of the month, full status text, no grid at
// all. A thin divider marks each new week purely for scanability, not as
// a layout grid.
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

  function wdFor(day: number): WeekDay {
    const d = days.find(x => x.day === day)!
    return { date: new Date(year, month - 1, day), year, month, day, dayName: d.dayName, isWeekend: d.isWeekend, isToday: d.isToday }
  }

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData } | null>(null)

  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
  }, [year, month])

  function openEditorForDays(dayNums: number[]) {
    if (readOnly || dayNums.length === 0) return
    const sorted = [...dayNums].sort((a, b) => a - b)
    const targets: Target[] = sorted.map(d => ({ wd: wdFor(d), dept, emp }))
    const initial = targets.length === 1
      ? (data[dateCellKey(year, month, sorted[0], dept, emp)] ?? emptyCell())
      : emptyCell()
    setEditing({ targets, cell: initial })
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelected(new Set())
  }

  function handleDayClick(day: number) {
    if (readOnly) return
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(day)) next.delete(day); else next.add(day)
        return next
      })
      return
    }
    openEditorForDays([day])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
          {DUTCH_MONTHS[month - 1]} {year}
        </p>
        {!readOnly && (
          <button onClick={toggleSelectMode} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">
            {selectMode ? 'Annuleren' : 'Selecteren'}
          </button>
        )}
      </div>

      <div className="space-y-1.5 pb-20">
        {days.map((d, i) => {
          const key = dateCellKey(year, month, d.day, dept, emp)
          const cell = data[key] ?? emptyCell()
          const isSelected = selectMode && selected.has(d.day)
          const isNewWeek = i > 0 && d.dayName === 'Maandag'
          return (
            <div key={d.day}>
              {isNewWeek && (
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mt-3 mb-1.5 px-0.5">
                  Week van {d.day} {DUTCH_MONTHS[month - 1].slice(0, 3)}
                </p>
              )}
              <button
                onClick={() => handleDayClick(d.day)}
                className="w-full flex items-center gap-3 pl-2.5 pr-3 py-3 rounded-xl border text-left transition-colors"
                style={{
                  borderColor: isSelected ? SEL_BORDER : '#27272a',
                  backgroundColor: isSelected ? SEL_BG : 'rgba(24,24,27,0.6)',
                  borderLeftWidth: isSelected ? '4px' : '1px',
                }}
              >
                {/* Whole row toggles the selection (not just this icon) —
                    the icon is the visual confirmation, not the hit
                    target, so this stays big and legible without needing
                    to itself be huge. */}
                {selectMode && (
                  <span
                    className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: isSelected ? '#3A913F' : 'rgba(255,255,255,0.06)',
                      border: isSelected ? 'none' : '1.5px solid #52525b',
                    }}
                  >
                    {isSelected && <Check size={15} className="text-white" strokeWidth={3} />}
                  </span>
                )}
                <span className={`w-14 flex-shrink-0 text-xs ${d.isToday ? 'text-emerald-400 font-semibold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'}`}>
                  {d.dayName.slice(0, 2).toUpperCase()} {d.day}
                </span>
                {cell.value ? (
                  <span
                    className="flex-1 min-w-0 truncate rounded-md px-2 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                  >
                    {cell.value}
                  </span>
                ) : (
                  <span className="flex-1 text-xs text-zinc-700">—</span>
                )}
                {cell.note && (
                  <span className="flex-shrink-0 max-w-[30%] truncate text-[10px] text-zinc-500">{cell.note}</span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl bg-zinc-800 border border-zinc-700">
          <span className="text-xs text-zinc-300 pl-1">
            {selected.size} {selected.size === 1 ? 'dag' : 'dagen'} geselecteerd
          </span>
          <button
            onClick={() => openEditorForDays([...selected])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            <Check size={12} /> Bewerken
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Selectie wissen"
            className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {editing && (
        <DayEditor
          title={editing.targets.length === 1
            ? `${editing.targets[0].wd.dayName} ${editing.targets[0].wd.day} ${DUTCH_MONTHS[month - 1]}`
            : `${editing.targets.length} dagen geselecteerd`}
          initialCell={editing.cell}
          presets={presets}
          readOnly={readOnly}
          emailToName={emailToName}
          dateEditor={{
            pool: days.map(d => wdFor(d.day)),
            selected: editing.targets.map(t => t.wd),
            onChange: next => {
              if (next.length === 0) { setEditing(null); setSelected(new Set()); setSelectMode(false); return }
              const sorted = [...next].sort((a, b) => a.day - b.day)
              setEditing(prev => prev && { ...prev, targets: sorted.map(wd => ({ wd, dept, emp })) })
            },
          }}
          onSave={cell => { onApply(editing.targets, cell); setEditing(null); setSelected(new Set()); setSelectMode(false) }}
          onClear={() => { onClear(editing.targets); setEditing(null); setSelected(new Set()); setSelectMode(false) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
