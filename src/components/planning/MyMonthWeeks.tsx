'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, getMonthWeeks, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'

// Desktop-only "Mijn maand": the whole month as full calendar weeks stacked
// on top of each other. Drag-select is the exact set of cells the pointer
// actually passed over (a freehand path), not the contiguous range between
// where you started and ended — dragging straight down one weekday column
// (e.g. "every Monday") selects only that column, since a vertical drag
// only ever visits that column's cells, rather than filling in every day of
// every week in between. This is its own drag/copy-paste implementation
// rather than reusing WeekGrid, since WeekGrid's row/col model is bounded to
// one instance's own 7 days and can't reach across sibling week-rows.
// Auto-scrolls to the current week on first load. Mobile keeps the old
// compact day-grid (MyMonthCalendar) — a 7-wide spacious row doesn't fit a
// phone.
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
  const allDays = weeks.flat()
  const todayRowRef = useRef<HTMLDivElement>(null)

  const dragPathRef = useRef<Set<number> | null>(null)
  const [selection, setSelection] = useState<Set<number> | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData; title: string } | null>(null)
  const clipboardRef = useRef<CellData | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
  }, [year, month])

  useEffect(() => {
    if (!menuKey) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuKey(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuKey])

  function dayTitle(wd: WeekDay) {
    return `${wd.dayName} ${wd.day} ${DUTCH_MONTHS[wd.month - 1]}`
  }

  function openEditorFor(idxs: number[]) {
    if (readOnly || idxs.length === 0) return
    const sorted = [...idxs].sort((a, b) => a - b)
    const targets: Target[] = sorted.map(i => ({ wd: allDays[i], dept, emp }))
    const single = targets.length === 1
    const initial = single
      ? (data[weekDayCellKey(targets[0].wd, dept, emp)] ?? emptyCell())
      : emptyCell()
    const title = single ? dayTitle(targets[0].wd) : `${targets.length} dagen geselecteerd`
    setEditing({ targets, cell: initial, title })
  }

  function handlePointerDown(e: React.PointerEvent, idx: number) {
    if (readOnly) return
    // Without this, starting the drag on the status pill's text kicks off
    // the browser's native text-selection/drag-start behavior, which
    // cancels the pointer sequence mid-drag.
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragPathRef.current = new Set([idx])
    setSelection(new Set([idx]))
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragPathRef.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-idx]') as HTMLElement | null
    if (!cellEl) return
    const idx = Number(cellEl.dataset.idx)
    if (dragPathRef.current.has(idx)) return
    dragPathRef.current.add(idx)
    setSelection(new Set(dragPathRef.current))
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragPathRef.current) { setSelection(null); return }
    const idxs = [...dragPathRef.current]
    dragPathRef.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    openEditorFor(idxs)
    setSelection(null)
  }

  function handleCopy(wd: WeekDay) {
    clipboardRef.current = data[weekDayCellKey(wd, dept, emp)] ?? emptyCell()
    setHasClipboard(true)
    setMenuKey(null)
  }

  function handlePaste(wd: WeekDay) {
    if (readOnly || !clipboardRef.current) { setMenuKey(null); return }
    onApply([{ wd, dept, emp }], clipboardRef.current)
    setMenuKey(null)
  }

  function handleClearCell(wd: WeekDay) {
    if (readOnly) { setMenuKey(null); return }
    onClear([{ wd, dept, emp }])
    setMenuKey(null)
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-zinc-800">
      {weeks.map((week, wi) => {
        const containsToday = week.some(wd => wd.isToday)
        return (
          <div key={wi} ref={containsToday ? todayRowRef : undefined}>
            <div className="grid grid-cols-7" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              {week.map(wd => {
                const isOverflow = wd.month !== month
                return (
                  <div
                    key={`h-${wd.year}-${wd.month}-${wd.day}`}
                    style={{ backgroundColor: wd.isToday ? '#111d11' : '#161616', opacity: isOverflow ? 0.4 : 1 }}
                    className="border-b border-r border-zinc-800 px-2 py-2 text-center last:border-r-0"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">{wd.dayName.slice(0, 2)}</p>
                    <p className={`text-sm font-semibold ${wd.isToday ? 'text-emerald-400' : 'text-zinc-300'}`}>{wd.day}</p>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-7">
              {week.map((wd, ci) => {
                const idx = wi * 7 + ci
                const isOverflow = wd.month !== month
                const key = weekDayCellKey(wd, dept, emp)
                const cell = data[key] ?? emptyCell()
                const isSelected = selection?.has(idx) ?? false
                const menuOpen = menuKey === key

                return (
                  <div
                    key={key}
                    data-idx={idx}
                    onPointerDown={e => handlePointerDown(e, idx)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDragStart={e => e.preventDefault()}
                    style={{
                      backgroundColor: isSelected ? SEL_BG : wd.isToday ? 'rgba(58,145,63,0.06)' : undefined,
                      outline: isSelected ? SEL_BDR : undefined,
                      outlineOffset: '-1px',
                      opacity: isOverflow ? 0.4 : readOnly ? 0.45 : 1,
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    className={`group relative border-b border-r border-zinc-800/60 last:border-r-0 p-3 min-h-[76px] flex flex-col items-center justify-center gap-0.5 ${readOnly ? '' : 'cursor-pointer'}`}
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

                    {!readOnly && (
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setMenuKey(m => m === key ? null : key) }}
                        aria-label="Meer opties"
                        className="tap-target absolute top-0.5 right-0.5 p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical size={11} />
                      </button>
                    )}

                    {menuOpen && (
                      <div ref={menuRef} onPointerDown={e => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg overflow-hidden shadow-2xl bg-zinc-800 border border-zinc-700">
                        <button onClick={() => handleCopy(wd)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
                          <Copy size={12} /> Kopiëren
                        </button>
                        <button onClick={() => handlePaste(wd)} disabled={!hasClipboard}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                          <ClipboardPaste size={12} /> Plakken
                        </button>
                        {cell.value && (
                          <button onClick={() => handleClearCell(wd)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-zinc-700 transition-colors">
                            <Trash2 size={12} /> Wissen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {editing && (
        <DayEditor
          title={editing.title}
          initialCell={editing.cell}
          presets={presets}
          readOnly={false}
          onSave={cell => { onApply(editing.targets, cell); setEditing(null) }}
          onClear={() => { onClear(editing.targets); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
