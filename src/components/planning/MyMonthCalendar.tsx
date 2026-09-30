'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'

// Mobile's own "Mijn maand". Previously ported desktop's drag-rectangle
// selection to touch — confirmed live that this felt "goofy and buggy" in
// practice, which checked out against how real scheduling apps (Deputy,
// When I Work, 7shifts) actually work: none of them use drag-select on
// mobile at all. The standard mobile pattern for "act on several things at
// once" is tap a Select button, tap items to check them, act on the
// selection — the same pattern Photos/Mail/Files use, not a drag gesture
// fighting the browser's own scroll.
//
// So the calendar grid here is pure glance/navigation (color dot per day,
// tap opens that single day) and the agenda list below is where both
// reading ("what does this month say") and bulk-editing (via Selecteren)
// actually happen.
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

  function toggleDay(day: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day); else next.add(day)
      return next
    })
  }

  function handleDayClick(day: number) {
    if (readOnly) return
    if (selectMode) { toggleDay(day); return }
    openEditorForDays([day])
  }

  const populatedDays = days.filter(d => (data[dateCellKey(year, month, d.day, dept, emp)] ?? emptyCell()).value)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="grid grid-cols-7 gap-1 flex-1">
          {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map(d => (
            <span key={d} className="text-[10px] text-zinc-600 text-center uppercase tracking-wide">{d}</span>
          ))}
        </div>
        {!readOnly && (
          <button onClick={toggleSelectMode} className="ml-2 text-[11px] text-zinc-400 hover:text-zinc-200 underline flex-shrink-0">
            {selectMode ? 'Annuleren' : 'Selecteren'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {days.map(d => {
          const key = dateCellKey(year, month, d.day, dept, emp)
          const cell = data[key] ?? emptyCell()
          const isSelected = selectMode && selected.has(d.day)
          return (
            <button
              key={d.day}
              onClick={() => handleDayClick(d.day)}
              style={{
                backgroundColor: isSelected ? SEL_BG : d.isToday ? 'rgba(58,145,63,0.08)' : 'rgba(255,255,255,0.02)',
                borderColor: isSelected ? undefined : d.isToday ? 'rgba(58,145,63,0.35)' : 'rgba(255,255,255,0.07)',
                outline: isSelected ? SEL_BDR : undefined,
                outlineOffset: '-1px',
                opacity: readOnly ? 0.6 : 1,
              }}
              className="tap-target aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-center gap-1 transition-colors"
            >
              <span className={`text-[11px] ${d.isToday ? 'text-emerald-400 font-semibold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'}`}>
                {d.day}
              </span>
              {/* Color signal only, no status text — a truncated pill in a
                  44px box ("VE…", "SP…") told you less than nothing; the
                  agenda list below is where the actual status name lives,
                  fully spelled out. */}
              {cell.value && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: cell.bgColor ?? '#71717a' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Agenda list — only days that actually have something planned,
          each shown with its full (untruncated) status and note. Tap a row
          to edit it directly; in select mode, tap toggles it into the bulk
          selection instead (same rows, same list — Select mode just
          changes what a tap does, exactly like Photos/Mail's own pattern). */}
      <div className="mt-4 space-y-1.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-0.5">Deze maand</p>
        {populatedDays.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-600">Nog niets ingevuld deze maand.</p>
        ) : (
          populatedDays.map(d => {
            const key = dateCellKey(year, month, d.day, dept, emp)
            const cell = data[key] ?? emptyCell()
            const isSelected = selectMode && selected.has(d.day)
            return (
              <button
                key={d.day}
                onClick={() => handleDayClick(d.day)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors"
                style={{
                  borderColor: isSelected ? 'rgba(59,130,246,0.5)' : '#27272a',
                  backgroundColor: isSelected ? SEL_BG : 'rgba(24,24,27,0.6)',
                }}
              >
                {selectMode && (
                  <span
                    className="w-4 h-4 flex-shrink-0 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? '#3A913F' : 'transparent',
                      border: isSelected ? 'none' : '1px solid #52525b',
                    }}
                  >
                    {isSelected && <Check size={11} className="text-white" />}
                  </span>
                )}
                <span className={`w-14 flex-shrink-0 text-xs ${d.isToday ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}`}>
                  {d.dayName.slice(0, 2).toUpperCase()} {d.day}
                </span>
                <span
                  className="flex-1 min-w-0 truncate rounded-md px-2 py-1 text-xs font-semibold"
                  style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                >
                  {cell.value}
                </span>
                {cell.note && (
                  <span className="flex-shrink-0 max-w-[30%] truncate text-[10px] text-zinc-500">{cell.note}</span>
                )}
              </button>
            )
          })
        )}
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
