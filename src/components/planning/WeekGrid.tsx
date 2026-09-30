'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreVertical, Copy, ClipboardPaste, Trash2, Star, ChevronDown, ChevronRight } from 'lucide-react'
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

interface SectionPrefs {
  favorites: string[]
  collapsed: string[]
}

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'
const EMPTY_PREFS: SectionPrefs = { favorites: [], collapsed: [] }

// First name only, unless that collides with someone else in the same
// roster — then add the first letter of the last name ("Robin B.") just for
// whoever collides, so the common case stays as short as possible.
function shortDisplayNames(people: Person[]): Map<string, string> {
  const firstNameCounts = new Map<string, number>()
  for (const p of people) {
    const first = p.emp.trim().split(/\s+/)[0] ?? p.emp
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1)
  }
  const result = new Map<string, string>()
  for (const p of people) {
    const parts = p.emp.trim().split(/\s+/)
    const first = parts[0] ?? p.emp
    const collides = (firstNameCounts.get(first) ?? 0) > 1
    result.set(p.emp, collides && parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first)
  }
  return result
}

// Used by Team (the full roster, grouped, dense). Desktop only: mobile gets
// its own simpler view (a 7-day-in-one-row grid doesn't fit a phone screen
// at any density) — see MobileTeamDayStepper. "Mijn" no longer has a week
// view (see MyMonthWeeks) but this still supports a single-person/spacious
// mode in case that's ever needed again.
export default function WeekGrid({
  week, people, data, canEditCol, presets, onApply, onClear,
  groupHeaders = false, showNameColumn = true, variant = 'compact', personSubtitle,
  prefsKey, forceExpandSections = false, emailToName,
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
  // Favorite/collapsed department sections — Team-only, remembered per
  // identity (there's no separate login-account preference store, so this
  // reuses the same localStorage-per-identity pattern as "who am I".
  prefsKey?: string
  forceExpandSections?: boolean
  emailToName?: Map<string, string>
}) {
  const dragRef = useRef<{ rowIdx: number; startCol: number } | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData; title: string; subtitle?: string } | null>(null)
  const clipboardRef = useRef<CellData | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [prefs, setPrefs] = useState<SectionPrefs>(EMPTY_PREFS)

  useEffect(() => {
    if (!menuKey) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuKey(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuKey])

  useEffect(() => {
    if (!prefsKey) { setPrefs(EMPTY_PREFS); return }
    try {
      const stored = localStorage.getItem(`planning-sections:${prefsKey}`)
      setPrefs(stored ? JSON.parse(stored) : EMPTY_PREFS)
    } catch { setPrefs(EMPTY_PREFS) }
  }, [prefsKey])

  function toggleFavorite(dept: string) {
    if (!prefsKey) return
    setPrefs(prev => {
      const next = {
        ...prev,
        favorites: prev.favorites.includes(dept) ? prev.favorites.filter(d => d !== dept) : [...prev.favorites, dept],
      }
      try { localStorage.setItem(`planning-sections:${prefsKey}`, JSON.stringify(next)) } catch { /* private browsing */ }
      return next
    })
  }

  function toggleCollapsed(dept: string) {
    if (!prefsKey) return
    setPrefs(prev => {
      const next = {
        ...prev,
        collapsed: prev.collapsed.includes(dept) ? prev.collapsed.filter(d => d !== dept) : [...prev.collapsed, dept],
      }
      try { localStorage.setItem(`planning-sections:${prefsKey}`, JSON.stringify(next)) } catch { /* private browsing */ }
      return next
    })
  }

  const displayNames = useMemo(() => shortDisplayNames(people), [people])

  // Grouping, favorite-first ordering, and collapse all happen here in one
  // pass so the row index assigned to each person (used by drag-select and
  // the pointer-move hit-test) always matches renderedPeople — reordering
  // departments must never desync those from the `people` prop's own order.
  type RenderRow =
    | { kind: 'dept-header'; dept: string; count: number }
    | { kind: 'person'; rowIdx: number; person: Person }

  const { renderRows, renderedPeople } = useMemo(() => {
    const groups = groupHeaders
      ? Object.entries(
          people.reduce<Record<string, Person[]>>((acc, p) => {
            (acc[p.dept] ??= []).push(p)
            return acc
          }, {})
        )
      : [['', people] as [string, Person[]]]

    const ordered = groupHeaders && prefsKey
      ? [...groups].sort((a, b) => {
          const af = prefs.favorites.includes(a[0]) ? 0 : 1
          const bf = prefs.favorites.includes(b[0]) ? 0 : 1
          return af - bf
        })
      : groups

    const rr: RenderRow[] = []
    const rp: Person[] = []
    for (const [deptName, deptPeople] of ordered) {
      const isCollapsed = groupHeaders && prefsKey && !forceExpandSections && prefs.collapsed.includes(deptName)
      if (groupHeaders && deptName) rr.push({ kind: 'dept-header', dept: deptName, count: deptPeople.length })
      if (isCollapsed) continue
      for (const person of deptPeople) {
        const rowIdx = rp.length
        rp.push(person)
        rr.push({ kind: 'person', rowIdx, person })
      }
    }
    return { renderRows: rr, renderedPeople: rp }
  }, [people, groupHeaders, prefsKey, prefs.favorites, prefs.collapsed, forceExpandSections])

  function dayTitle(wd: WeekDay) {
    return `${wd.dayName} ${wd.day} ${DUTCH_MONTHS[wd.month - 1]}`
  }

  function openEditorFor(rowIdx: number, colStart: number, colEnd: number) {
    const person = renderedPeople[rowIdx]
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

  function handlePointerDown(e: React.PointerEvent, person: Person, rowIdx: number, colIdx: number) {
    if (!canEditCol(person.emp)) return
    // Without this, starting the drag on the status pill's text kicks off the
    // browser's native text-selection/drag-start behavior, which cancels the
    // pointer sequence mid-drag (pointermove stops firing) — the range would
    // silently freeze at the first cell.
    e.preventDefault()
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

  function handleCopy(person: Person, colIdx: number) {
    const key = weekDayCellKey(week[colIdx], person.dept, person.emp)
    clipboardRef.current = data[key] ?? emptyCell()
    setHasClipboard(true)
    setMenuKey(null)
  }

  function handlePaste(person: Person, colIdx: number) {
    if (!canEditCol(person.emp) || !clipboardRef.current) { setMenuKey(null); return }
    onApply([{ wd: week[colIdx], dept: person.dept, emp: person.emp }], clipboardRef.current)
    setMenuKey(null)
  }

  function handleClearCell(person: Person, colIdx: number) {
    if (!canEditCol(person.emp)) { setMenuKey(null); return }
    onClear([{ wd: week[colIdx], dept: person.dept, emp: person.emp }])
    setMenuKey(null)
  }

  const cellPad = variant === 'spacious' ? 'p-3' : 'p-1.5'
  const cellMinH = variant === 'spacious' ? 'min-h-[76px]' : 'min-h-[52px]'
  const nameColWidth = showNameColumn ? 160 : 0
  // minmax(64px, 1fr) instead of a bare 1fr — this used to assume "7
  // columns always fit" (desktop-only), so columns just squeezed toward
  // nothing on a narrow screen. The 64px floor keeps a day column legible
  // on mobile and forces horizontal scroll instead, same technique already
  // applied to TeamMonthGrid's day columns.
  const gridTemplateColumns = showNameColumn
    ? `${nameColWidth}px repeat(7, minmax(64px, 1fr))`
    : 'repeat(7, minmax(64px, 1fr))'

  return (
    <div className="h-full overflow-auto rounded-xl border border-zinc-800">
      <div style={{ display: 'grid', gridTemplateColumns, width: '100%', minWidth: 'max-content' }}>
        {/* Header row was the only sticky thing here on purpose — "a week
            never needs to scroll sideways" was a desktop-only assumption.
            Now that mobile can reach this view too, the corner + name
            column need the same frozen-corner treatment as TeamMonthGrid. */}
        {showNameColumn && (
          <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 30, backgroundColor: '#161616' }}
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

        {renderRows.map(row => {
          if (row.kind === 'dept-header') {
            const { dept, count } = row
            const isFav = prefs.favorites.includes(dept)
            const isCollapsed = !forceExpandSections && prefs.collapsed.includes(dept)
            return (
              <div key={`dept-${dept}`} style={{ gridColumn: '1 / -1', width: 'fit-content', minWidth: '100%' }}
                className="bg-zinc-900/60">
                {/* Sticky here, not on the row above — that outer div only
                    paints the full-width tint (its own left edge sits at
                    column 1 and never moves), the label is what actually
                    needs to stay pinned while scrolling. */}
                <div style={{ position: 'sticky', left: 0, zIndex: 10, width: 'fit-content' }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                  <button
                    onClick={() => toggleCollapsed(dept)}
                    disabled={forceExpandSections}
                    className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors disabled:cursor-default"
                  >
                    {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    {dept}
                    <span className="normal-case font-normal text-zinc-600">({count})</span>
                  </button>
                  {prefsKey && (
                    <button
                      onClick={() => toggleFavorite(dept)}
                      aria-label={isFav ? 'Verwijder als favoriet' : 'Markeer als favoriet'}
                      className={`transition-colors ${isFav ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                    >
                      <Star size={11} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              </div>
            )
          }

          const { person, rowIdx } = row
          const locked = !canEditCol(person.emp)

          return (
            <div key={`row-${rowIdx}`} style={{ display: 'contents' }}>
              {showNameColumn && (
                <div
                  title={person.emp}
                  style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#161616' }}
                  className={`border-b border-r border-zinc-800 px-3 flex items-center text-sm font-medium truncate ${locked ? 'text-zinc-600' : 'text-zinc-300'}`}>
                  {displayNames.get(person.emp) ?? person.emp}
                </div>
              )}

              {week.map((wd, colIdx) => {
                const key = weekDayCellKey(wd, person.dept, person.emp)
                const cell = data[key] ?? emptyCell()
                const isSelected = selection && selection.rowIdx === rowIdx &&
                  colIdx >= Math.min(selection.startCol, selection.endCol) &&
                  colIdx <= Math.max(selection.startCol, selection.endCol)
                const menuOpen = menuKey === key

                return (
                  <div
                    key={key}
                    data-row={rowIdx}
                    data-col={colIdx}
                    onPointerDown={e => handlePointerDown(e, person, rowIdx, colIdx)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDragStart={e => e.preventDefault()}
                    style={{
                      backgroundColor: isSelected ? SEL_BG : wd.isToday ? 'rgba(58,145,63,0.06)' : undefined,
                      outline: isSelected ? SEL_BDR : undefined,
                      outlineOffset: '-1px',
                      opacity: locked ? 0.45 : 1,
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
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
                        <button onClick={() => handleCopy(person, colIdx)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
                          <Copy size={12} /> Kopiëren
                        </button>
                        <button onClick={() => handlePaste(person, colIdx)} disabled={!hasClipboard}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
                          <ClipboardPaste size={12} /> Plakken
                        </button>
                        {cell.value && (
                          <button onClick={() => handleClearCell(person, colIdx)}
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
          )
        })}
      </div>

      {editing && (
        <DayEditor
          title={editing.title}
          subtitle={editing.subtitle}
          initialCell={editing.cell}
          presets={presets}
          readOnly={false}
          emailToName={emailToName}
          onSave={cell => { onApply(editing.targets, cell); setEditing(null) }}
          onClear={() => { onClear(editing.targets); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
