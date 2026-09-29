'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Copy, ClipboardPaste, Trash2, Check, X } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, getMonthWeeks, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface Target { wd: WeekDay; dept: string; emp: string }
interface DragState { start: number; additive: boolean; cells: Set<number> }

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'
const SCROLL_EDGE = 60
const SCROLL_MAX_SPEED = 16

// A day's flat index is wi*7+ci — row/col math below turns two such indices
// into every index inside the rectangle they bound, regardless of which
// direction the drag went.
function rectIndices(aIdx: number, bIdx: number): number[] {
  const ar = Math.floor(aIdx / 7), ac = aIdx % 7
  const br = Math.floor(bIdx / 7), bc = bIdx % 7
  const r0 = Math.min(ar, br), r1 = Math.max(ar, br)
  const c0 = Math.min(ac, bc), c1 = Math.max(ac, bc)
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * 7 + c)
  return out
}

// Desktop-only "Mijn maand": the whole month as full calendar weeks stacked
// on top of each other.
//
// Selection model:
// - Plain drag → a real selection box (every day inside the rectangle
//   between where you started and let go, not just the cells the cursor
//   physically crossed) — release immediately opens the editor for it, same
//   fast path as before.
// - Ctrl/Cmd+click or Ctrl/Cmd+drag → builds up a "committed" selection that
//   can include non-adjacent days, without opening the editor on every
//   click, so you can keep adding more days first.
// - Shift+click → extends the committed selection as a box from the last
//   plain click ("anchor") to the shift-clicked day.
// - Once something is committed, Enter / double-click / the floating
//   "Bewerken" button opens the editor for that whole (possibly
//   non-contiguous) set at once. Escape or a fresh plain click clears it.
//
// This is its own drag/copy-paste implementation rather than reusing
// WeekGrid, since WeekGrid's row/col model is bounded to one instance's own
// 7 days and can't reach across sibling week-rows.
export default function MyMonthWeeks({
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
  const weeks = getMonthWeeks(year, month)
  const allDays = weeks.flat()
  const todayRowRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [committed, setCommitted] = useState<Set<number> | null>(null)
  const anchorRef = useRef<number | null>(null)
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)
  const scrollRafRef = useRef<number | null>(null)

  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData } | null>(null)
  const clipboardRef = useRef<CellData | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const displaySelection = drag
    ? (drag.additive ? new Set([...(committed ?? []), ...drag.cells]) : drag.cells)
    : committed

  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: 'center' })
    setCommitted(null)
    setDrag(null)
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
    const initial = targets.length === 1
      ? (data[weekDayCellKey(targets[0].wd, dept, emp)] ?? emptyCell())
      : emptyCell()
    setEditing({ targets, cell: initial })
  }

  // Enter commits the current selection, Escape drops it — both skipped
  // while typing anywhere else (a rename field, the note textarea, …).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter' && committed && committed.size > 0) {
        e.preventDefault()
        openEditorFor([...committed])
      } else if (e.key === 'Escape' && committed) {
        setCommitted(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Dragging near the top/bottom edge of the scroll container keeps
  // scrolling it (and growing the selection rectangle to match) even though
  // the pointer itself isn't moving — without this, whichever week is just
  // out of view can never be reached by a single continuous drag.
  function autoScrollTick(dragStart: number) {
    const container = containerRef.current
    const pos = pointerPosRef.current
    if (container && pos) {
      const rect = container.getBoundingClientRect()
      let dy = 0
      if (pos.y < rect.top + SCROLL_EDGE) {
        dy = -SCROLL_MAX_SPEED * Math.min(1, (rect.top + SCROLL_EDGE - pos.y) / SCROLL_EDGE)
      } else if (pos.y > rect.bottom - SCROLL_EDGE) {
        dy = SCROLL_MAX_SPEED * Math.min(1, (pos.y - (rect.bottom - SCROLL_EDGE)) / SCROLL_EDGE)
      }
      if (dy !== 0) {
        container.scrollTop += dy
        const el = document.elementFromPoint(pos.x, pos.y)
        const cellEl = el?.closest('[data-idx]') as HTMLElement | null
        if (cellEl) {
          const idx = Number(cellEl.dataset.idx)
          setDrag(prev => prev && { ...prev, cells: new Set(rectIndices(dragStart, idx)) })
        }
      }
    }
    scrollRafRef.current = requestAnimationFrame(() => autoScrollTick(dragStart))
  }

  function stopAutoScroll() {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    pointerPosRef.current = null
  }

  useEffect(() => stopAutoScroll, [])

  function handlePointerDown(e: React.PointerEvent, idx: number) {
    if (readOnly) return
    // Without this, starting the drag on the status pill's text kicks off
    // the browser's native text-selection/drag-start behavior, which
    // cancels the pointer sequence mid-drag.
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (e.shiftKey && anchorRef.current !== null) {
      setCommitted(new Set(rectIndices(anchorRef.current, idx)))
      return
    }

    anchorRef.current = idx
    setDrag({ start: idx, additive: e.ctrlKey || e.metaKey, cells: new Set([idx]) })
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    scrollRafRef.current = requestAnimationFrame(() => autoScrollTick(idx))
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    pointerPosRef.current = { x: e.clientX, y: e.clientY }
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-idx]') as HTMLElement | null
    if (!cellEl) return
    const idx = Number(cellEl.dataset.idx)
    setDrag(prev => prev && { ...prev, cells: new Set(rectIndices(prev.start, idx)) })
  }

  function handlePointerUp(e: React.PointerEvent) {
    stopAutoScroll()
    if (!drag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }

    if (!drag.additive) {
      const idxs = [...drag.cells]
      setDrag(null)
      setCommitted(null)
      openEditorFor(idxs)
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

  function handleDoubleClick(idx: number) {
    if (readOnly) return
    openEditorFor(committed && committed.size > 0 ? [...committed] : [idx])
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
    <div ref={containerRef} className="h-full overflow-y-auto rounded-xl border border-zinc-800">
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
                const isSelected = displaySelection?.has(idx) ?? false
                const menuOpen = menuKey === key

                return (
                  <div
                    key={key}
                    data-idx={idx}
                    onPointerDown={e => handlePointerDown(e, idx)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDoubleClick={() => handleDoubleClick(idx)}
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

      {committed && committed.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-2xl bg-zinc-800 border border-zinc-700">
          <span className="text-xs text-zinc-300 pl-1">
            {committed.size} {committed.size === 1 ? 'dag' : 'dagen'} geselecteerd
          </span>
          <button
            onClick={() => openEditorFor([...committed])}
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
          title={editing.targets.length === 1 ? dayTitle(editing.targets[0].wd) : `${editing.targets.length} dagen geselecteerd`}
          initialCell={editing.cell}
          presets={presets}
          readOnly={false}
          emailToName={emailToName}
          dateEditor={{
            pool: allDays,
            selected: editing.targets.map(t => t.wd),
            onChange: next => {
              if (next.length === 0) { setEditing(null); setCommitted(null); return }
              const sorted = [...next].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)
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
