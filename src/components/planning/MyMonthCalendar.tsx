'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth } from '@/lib/planning-config'
import { dateCellKey, emptyCell, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }
interface DragState { start: number; additive: boolean; cells: Set<number> }

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'

// Same row/col rectangle math as MyMonthWeeks — a day's flat grid index
// (leadingBlanks + day - 1, so it matches the actual visual position, not
// just the day number) turns two such indices into every index inside the
// rectangle they bound.
function rectIndices(aIdx: number, bIdx: number): number[] {
  const ar = Math.floor(aIdx / 7), ac = aIdx % 7
  const br = Math.floor(bIdx / 7), bc = bIdx % 7
  const r0 = Math.min(ar, br), r1 = Math.max(ar, br)
  const c0 = Math.min(ac, bc), c1 = Math.max(ac, bc)
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * 7 + c)
  return out
}

// Mobile's own "Mijn maand" — same drag/ctrl/shift-click box-selection
// model as desktop's MyMonthWeeks, ported rather than shared since the grid
// shapes differ (a single month with leading blank slots here vs. stacked
// full calendar weeks there). On pure touch (no ctrl/shift key to hold)
// this collapses to exactly the interaction that matters most: drag across
// days, lift your finger, the editor opens for the whole range at once —
// previously mobile had no bulk selection at all, one tap per day only.
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

  function gridIdx(day: number) { return leadingBlanks + day - 1 }
  function dayForGridIdx(idx: number) { return idx - leadingBlanks + 1 }

  function wdFor(day: number): WeekDay {
    const d = days.find(x => x.day === day)!
    return { date: new Date(year, month - 1, day), year, month, day, dayName: d.dayName, isWeekend: d.isWeekend, isToday: d.isToday }
  }

  const [drag, setDrag] = useState<DragState | null>(null)
  const [committed, setCommitted] = useState<Set<number> | null>(null)
  const anchorRef = useRef<number | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData } | null>(null)

  useEffect(() => {
    setCommitted(null)
    setDrag(null)
  }, [year, month])

  const displaySelection = drag
    ? (drag.additive ? new Set([...(committed ?? []), ...drag.cells]) : drag.cells)
    : committed

  // A drag rectangle can span into a blank leading slot (e.g. dragging from
  // day 2 up into the empty cells before day 1) — those simply aren't real
  // days and get dropped here rather than needing special-casing earlier.
  function idxsToDays(idxs: Iterable<number>): number[] {
    const out: number[] = []
    for (const idx of idxs) {
      const day = dayForGridIdx(idx)
      if (day >= 1 && day <= days.length) out.push(day)
    }
    return out
  }

  function openEditorFor(idxs: Iterable<number>) {
    if (readOnly) return
    const dayNums = idxsToDays(idxs).sort((a, b) => a - b)
    if (dayNums.length === 0) return
    const targets: Target[] = dayNums.map(d => ({ wd: wdFor(d), dept, emp }))
    const initial = targets.length === 1
      ? (data[dateCellKey(year, month, dayNums[0], dept, emp)] ?? emptyCell())
      : emptyCell()
    setEditing({ targets, cell: initial })
  }

  // Enter commits the current selection, Escape drops it — mirrors
  // MyMonthWeeks; harmless no-ops on a pure touch device with no keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter' && committed && committed.size > 0) {
        e.preventDefault()
        openEditorFor(committed)
      } else if (e.key === 'Escape' && committed) {
        setCommitted(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function handlePointerDown(e: React.PointerEvent, idx: number) {
    if (readOnly) return
    // Without this, starting the drag kicks off the browser's native
    // text-selection/drag-start (and, on touch, page-scroll) behavior,
    // which cancels the pointer sequence mid-drag.
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (e.shiftKey && anchorRef.current !== null) {
      setCommitted(new Set(rectIndices(anchorRef.current, idx)))
      return
    }

    anchorRef.current = idx
    setDrag({ start: idx, additive: e.ctrlKey || e.metaKey, cells: new Set([idx]) })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-idx]') as HTMLElement | null
    if (!cellEl) return
    const idx = Number(cellEl.dataset.idx)
    setDrag(prev => prev && { ...prev, cells: new Set(rectIndices(prev.start, idx)) })
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }

    if (!drag.additive) {
      const cells = drag.cells
      setDrag(null)
      setCommitted(null)
      openEditorFor(cells)
      return
    }

    if (drag.cells.size === 1) {
      const only = [...drag.cells][0]
      setCommitted(prev => {
        const next = new Set(prev ?? [])
        if (next.has(only)) next.delete(only); else next.add(only)
        return next.size ? next : null
      })
    } else {
      setCommitted(prev => new Set([...(prev ?? []), ...drag.cells]))
    }
    setDrag(null)
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
          const idx = gridIdx(d.day)
          const key = dateCellKey(year, month, d.day, dept, emp)
          const cell = data[key] ?? emptyCell()
          const isSelected = displaySelection?.has(idx) ?? false
          return (
            <div
              key={d.day}
              data-idx={idx}
              onPointerDown={e => handlePointerDown(e, idx)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDragStart={e => e.preventDefault()}
              style={{
                backgroundColor: isSelected ? SEL_BG : d.isToday ? 'rgba(58,145,63,0.08)' : 'rgba(255,255,255,0.02)',
                borderColor: isSelected ? undefined : d.isToday ? 'rgba(58,145,63,0.35)' : 'rgba(255,255,255,0.07)',
                outline: isSelected ? SEL_BDR : undefined,
                outlineOffset: '-1px',
                opacity: readOnly ? 0.6 : 1,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
              className={`tap-target aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-center gap-1 transition-colors ${readOnly ? '' : 'cursor-pointer'}`}
            >
              <span className={`text-[11px] ${d.isToday ? 'text-emerald-400 font-semibold' : d.isWeekend ? 'text-zinc-600' : 'text-zinc-500'}`}>
                {d.day}
              </span>
              {cell.value && (
                <span
                  className="w-full truncate rounded px-1 py-0.5 text-center text-[9px] font-semibold"
                  style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.1)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                >
                  {cell.value}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {committed && committed.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl bg-zinc-800 border border-zinc-700">
          <span className="text-xs text-zinc-300 pl-1">
            {committed.size} {committed.size === 1 ? 'dag' : 'dagen'} geselecteerd
          </span>
          <button
            onClick={() => openEditorFor(committed)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            <Check size={12} /> Bewerken
          </button>
          <button
            onClick={() => setCommitted(null)}
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
              if (next.length === 0) { setEditing(null); setCommitted(null); return }
              const sorted = [...next].sort((a, b) => a.day - b.day)
              setEditing(prev => prev && { ...prev, targets: sorted.map(wd => ({ wd, dept, emp })) })
            },
          }}
          onSave={cell => { onApply(editing.targets, cell); setEditing(null); setCommitted(null) }}
          onClear={() => { onClear(editing.targets); setEditing(null); setCommitted(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
