'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

export interface Person {
  dept: string
  emp: string
}

interface Target {
  wd: WeekDay
  dept: string
  emp: string
}

interface Selection {
  rowIdx: number
  startCol: number
  endCol: number
}

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'

// Shared by both tabs — Team passes the full roster (grouped, dense); Mijn
// week passes a single person and no group headers (bigger, calmer cells).
// Desktop only: mobile gets its own simpler views (a 7-day-in-one-row grid
// doesn't fit a phone screen at any density) — see MobileMyWeekAgenda /
// MobileTeamDayStepper.
export default function WeekGrid({
  week, people, data, canEditCol, presets, onApply, onClear,
  groupHeaders = false, showNameColumn = true, variant = 'compact', personSubtitle,
}: {
  week: WeekDay[]
  people: Person[]
  data: PlanningWeekData
  canEditCol: (emp: string) => boolean
  presets: PlanningPreset[]
  onApply: (targets: Target[], value: CellData) => void
  onClear: (targets: Target[]) => void
  groupHeaders?: boolean
  showNameColumn?: boolean
  variant?: 'compact' | 'spacious'
  personSubtitle?: (p: Person) => string
}) {
  const dragRef = useRef<{ rowIdx: number; startCol: number } | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData; title: string; subtitle?: string } | null>(null)
  const clipboardRef = useRef<CellData | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  function openEditorFor(rowIdx: number, colStart: number, colEnd: number) {
    const person = people[rowIdx]
    if (!person || !canEditCol(person.emp)) return
    const targets: Target[] = week.slice(colStart, colEnd + 1).map(wd => ({ wd, dept: person.dept, emp: person.emp }))
    const single = targets.length === 1
    const initial = single
      ? (data[weekDayCellKey(targets[0].wd, person.dept, person.emp)] ?? emptyCell())
      : emptyCell()
    const title = single
      ? dayTitle(targets[0].wd)
      : `${targets.length} dagen — ${dayTitle(targets[0].wd)} t/m ${dayTitle(targets[targets.length - 1].wd)}`
    setEditing({ targets, cell: initial, title, subtitle: personSubtitle?.(person) })
  }

  function handlePointerDown(e: React.PointerEvent, rowIdx: number, colIdx: number) {
    const person = people[rowIdx]
    if (!person || !canEditCol(person.emp)) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { rowIdx, startCol: colIdx }
    setSelection({ rowIdx, startCol: colIdx, endCol: colIdx })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-row][data-col]') as HTMLElement | null
    if (!cellEl) return
    const rowIdx = Number(cellEl.dataset.row)
    const colIdx = Number(cellEl.dataset.col)
    if (rowIdx !== dragRef.current.rowIdx) return
    setSelection({ rowIdx, startCol: dragRef.current.startCol, endCol: colIdx })
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragRef.current) { setSelection(null); return }
    const { rowIdx } = dragRef.current
    const sel = selection
    dragRef.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (sel) {
      const minCol = Math.min(sel.startCol, sel.endCol)
      const maxCol = Math.max(sel.startCol, sel.endCol)
      openEditorFor(rowIdx, minCol, maxCol)
    }
    setSelection(null)
  }

  function handleCopy(rowIdx: number, colIdx: number) {
    const person = people[rowIdx]
    const key = weekDayCellKey(week[colIdx], person.dept, person.emp)
    clipboardRef.current = data[key] ?? emptyCell()
    setHasClipboard(true)
    setMenuKey(null)
  }

  function handlePaste(rowIdx: number, colIdx: number) {
    const person = people[rowIdx]
    if (!canEditCol(person.emp) || !clipboardRef.current) { setMenuKey(null); return }
    onApply([{ wd: week[colIdx], dept: person.dept, emp: person.emp }], clipboardRef.current)
    setMenuKey(null)
  }

  function handleClearCell(rowIdx: number, colIdx: number) {
    const person = people[rowIdx]
    if (!canEditCol(person.emp)) { setMenuKey(null); return }
    onClear([{ wd: week[colIdx], dept: person.dept, emp: person.emp }])
    setMenuKey(null)
  }

  const cellPad = variant === 'spacious' ? 'p-3' : 'p-1.5'
  const cellMinH = variant === 'spacious' ? 'min-h-[76px]' : 'min-h-[52px]'
  const nameColWidth = showNameColumn ? 160 : 0
  const gridTemplateColumns = showNameColumn
    ? `${nameColWidth}px repeat(7, minmax(0, 1fr))`
    : 'repeat(7, minmax(0, 1fr))'

  let globalRowIdx = -1

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-zinc-800">
      <div style={{ display: 'grid', gridTemplateColumns }}>
        {/* Header row — the only sticky thing in this whole redesign, and
            it's a single axis (top), because a week never needs to scroll
            sideways. No frozen-corner complexity like the old month grid. */}
        {showNameColumn && (
          <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#161616' }}
            className="border-b border-r border-zinc-800" />
        )}
        {week.map(wd => (
          <div key={`h-${wd.year}-${wd.month}-${wd.day}`}
            style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: wd.isToday ? '#111d11' : '#161616' }}
            className="border-b border-zinc-800 px-2 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{wd.dayName.slice(0, 2)}</p>
            <p className={`text-sm font-semibold ${wd.isToday ? 'text-emerald-400' : 'text-zinc-300'}`}>{wd.day}</p>
          </div>
        ))}

        {(() => {
          const rows: React.ReactNode[] = []
          const groups = groupHeaders
            ? Object.entries(
                people.reduce<Record<string, Person[]>>((acc, p) => {
                  (acc[p.dept] ??= []).push(p)
                  return acc
                }, {})
              )
            : [['', people] as [string, Person[]]]

          for (const [deptName, deptPeople] of groups) {
            if (groupHeaders && deptName) {
              rows.push(
                <div key={`dept-${deptName}`} style={{ gridColumn: '1 / -1' }}
                  className="px-3 py-1.5 bg-zinc-900/60 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                  {deptName}
                </div>
              )
            }
            for (const person of deptPeople) {
              globalRowIdx += 1
              const rowIdx = globalRowIdx
              const locked = !canEditCol(person.emp)

              if (showNameColumn) {
                rows.push(
                  <div key={`name-${rowIdx}`}
                    className={`border-b border-r border-zinc-800 px-3 flex items-center text-sm font-medium truncate ${locked ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {person.emp}
                  </div>
                )
              }

              week.forEach((wd, colIdx) => {
                const key = weekDayCellKey(wd, person.dept, person.emp)
                const cell = data[key] ?? emptyCell()
                const isSelected = selection && selection.rowIdx === rowIdx &&
                  colIdx >= Math.min(selection.startCol, selection.endCol) &&
                  colIdx <= Math.max(selection.startCol, selection.endCol)
                const menuOpen = menuKey === key

                rows.push(
                  <div
                    key={key}
                    data-row={rowIdx}
                    data-col={colIdx}
                    onPointerDown={e => handlePointerDown(e, rowIdx, colIdx)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    style={{
                      backgroundColor: isSelected ? SEL_BG : wd.isToday ? 'rgba(58,145,63,0.06)' : undefined,
                      outline: isSelected ? SEL_BDR : undefined,
                      outlineOffset: '-1px',
                      opacity: locked ? 0.45 : 1,
                      touchAction: 'none',
                    }}
                    className={`relative border-b border-zinc-800/60 border-r ${cellPad} ${cellMinH} flex flex-col items-center justify-center gap-0.5 ${locked ? '' : 'cursor-pointer'}`}
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
                      !locked && <span className="text-zinc-700 text-xs">+</span>
                    )}

                    {!locked && (
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setMenuKey(m => m === key ? null : key) }}
                        aria-label="Meer opties"
                        className="tap-target absolute top-0.5 right-0.5 p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical size={11} />
                      </button>
                    )}

                    {menuOpen && (
                      <div ref={menuRef} onPointerDown={e => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg overflow-hidden shadow-2xl bg-zinc-800 border border-zinc-700">
                        <button onClick={() => handleCopy(rowIdx, colIdx)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
                          <Copy size={12} /> Kopiëren
                        </button>
                        <button onClick={() => handlePaste(rowIdx, colIdx)} disabled={!hasClipboard}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                          <ClipboardPaste size={12} /> Plakken
                        </button>
                        {cell.value && (
                          <button onClick={() => handleClearCell(rowIdx, colIdx)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-zinc-700 transition-colors">
                            <Trash2 size={12} /> Wissen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            }
          }
          return rows
        })()}
      </div>

      {editing && (
        <DayEditor
          title={editing.title}
          subtitle={editing.subtitle}
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
