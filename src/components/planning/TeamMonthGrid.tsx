'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Star, ChevronDown, ChevronRight } from 'lucide-react'
import { DUTCH_MONTHS, personKey, type Person } from '@/lib/planning-config'
import { dayInfo, emptyCell, weekDayCellKey, type CellData, type PlanningWeekData, type Target, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

interface DragState { startRow: number; startCol: number; endRow: number; endCol: number }
interface SectionPrefs { favorites: string[]; collapsed: string[] }

const SEL_BG = 'rgba(59,130,246,0.15)'
const SEL_BDR = '1px solid rgba(59,130,246,0.5)'
const EMPTY_PREFS: SectionPrefs = { favorites: [], collapsed: [] }
const NAME_COL_WIDTH = 108
const DAY_COL_WIDTH = 30
// Amber to stay visually distinct from the blue drag-selection tint. The
// name cell is opaque (it's sticky over horizontally-scrolling day columns,
// so a translucent color there would let scrolled-under cells bleed
// through) — day cells aren't sticky, so a translucent wash reads fine.
const ROW_HIGHLIGHT_NAME_BG = '#2e2712'
const ROW_HIGHLIGHT_CELL_BG = 'rgba(245,158,11,0.10)'
const WEEKEND_CELL_BG = 'rgba(0,0,0,0.35)'
const WEEKEND_HEADER_BG = '#121212'

// Same collision rule as WeekGrid's week view — first name only, unless two
// people share it, then add the first letter of the last name for whoever
// collides.
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
    // Op (afdeling, naam) gesleuteld, niet op de naam: twee mensen met
    // dezelfde voornaam in verschillende afdelingen deelden anders één
    // ingang. Welke afdeling het is blijft leesbaar uit de groepskop.
    result.set(personKey(p), collides && parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first)
  }
  return result
}

// Team's "zoom out" month overview — the whole roster, one row per person,
// one column per day of the month. Deliberately not the primary editing
// surface (that's the week view): a people × 7-day grid stretched to a
// whole month is exactly the too-dense problem this app's planning redesign
// existed to fix, so the density is clawed back here by (a) a compact
// color-only pill per cell — no free text, no note, full detail is a click
// away — and (b) reusing the same favorite/collapse department sections as
// the week view, so a crowded roster can be thinned out. Needs its own
// frozen corner (sticky name column *and* sticky day header) since, unlike
// a week, a month's ~30 columns won't fit without horizontal scrolling.
export default function TeamMonthGrid({
  year, month, people, data, canEditCol, presets, onApply, onClear, prefsKey, forceExpandSections = false, emailToName,
}: {
  year: number
  month: number
  people: Person[]
  data: PlanningWeekData
  canEditCol: (p: Person) => boolean
  presets: PlanningPreset[]
  onApply: (targets: Target[], value: CellData) => void
  onClear: (targets: Target[]) => void
  prefsKey?: string
  forceExpandSections?: boolean
  emailToName?: Map<string, string>
}) {
  const days = useMemo(() => {
    const count = new Date(year, month, 0).getDate()
    return Array.from({ length: count }, (_, i) => dayInfo(new Date(year, month - 1, i + 1)))
  }, [year, month])

  // Scrolled into view on mount/whenever the visible month changes — a
  // ~30-column month otherwise opens scrolled all the way left (day 1),
  // hiding "today" off to the right until you scroll to find it.
  const todayColRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    todayColRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [year, month])

  const [drag, setDrag] = useState<DragState | null>(null)
  const [editing, setEditing] = useState<{ targets: Target[]; cell: CellData; title: string } | null>(null)
  const [prefs, setPrefs] = useState<SectionPrefs>(EMPTY_PREFS)
  // Keyed by person, not row index, so the highlight stays on the right
  // person even if favoriting/collapsing a department reorders the rows.
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null)

  // Same localStorage key as WeekGrid's Team view on purpose — favoriting or
  // collapsing a department should apply no matter which of the two views
  // you're looking at it from.
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

  type RenderRow =
    | { kind: 'dept-header'; dept: string; count: number }
    | { kind: 'person'; rowIdx: number; person: Person }

  const { renderRows, renderedPeople } = useMemo(() => {
    const groups = Object.entries(
      people.reduce<Record<string, Person[]>>((acc, p) => {
        (acc[p.dept] ??= []).push(p)
        return acc
      }, {})
    )
    const ordered = prefsKey
      ? [...groups].sort((a, b) => {
          const af = prefs.favorites.includes(a[0]) ? 0 : 1
          const bf = prefs.favorites.includes(b[0]) ? 0 : 1
          return af - bf
        })
      : groups

    const rr: RenderRow[] = []
    const rp: Person[] = []
    for (const [deptName, deptPeople] of ordered) {
      const isCollapsed = !!prefsKey && !forceExpandSections && prefs.collapsed.includes(deptName)
      if (deptName) rr.push({ kind: 'dept-header', dept: deptName, count: deptPeople.length })
      if (isCollapsed) continue
      for (const person of deptPeople) {
        const rowIdx = rp.length
        rp.push(person)
        rr.push({ kind: 'person', rowIdx, person })
      }
    }
    return { renderRows: rr, renderedPeople: rp }
  }, [people, prefsKey, prefs.favorites, prefs.collapsed, forceExpandSections])

  function dayTitle(wd: WeekDay) {
    return `${wd.dayName} ${wd.day} ${DUTCH_MONTHS[wd.month - 1]}`
  }

  function openEditorFor(r0: number, r1: number, c0: number, c1: number) {
    const targets: Target[] = []
    // Wie er bij de eerste cel hoort, voor de titel. De rest van de selectie
    // kan meerdere mensen beslaan en krijgt een telling.
    let first: Person | null = null
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      const person = renderedPeople[r]
      if (!person || !canEditCol(person)) continue
      if (!first) first = person
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
        targets.push({ wd: days[c], contactId: person.id })
      }
    }
    if (targets.length === 0 || !first) return
    const single = targets.length === 1
    const initial = single
      ? (data[weekDayCellKey(targets[0].wd, targets[0].contactId)] ?? emptyCell())
      : emptyCell()
    const title = single
      ? `${dayTitle(targets[0].wd)} — ${displayNames.get(personKey(first)) ?? first.emp}`
      : `${targets.length} cellen geselecteerd`
    setEditing({ targets, cell: initial, title })
  }

  function handlePointerDown(e: React.PointerEvent, person: Person, row: number, col: number) {
    if (!canEditCol(person)) return
    // Without this, starting the drag on the status pill's text kicks off
    // the browser's native text-selection/drag-start behavior, which
    // cancels the pointer sequence mid-drag.
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ startRow: row, startCol: col, endRow: row, endCol: col })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-row][data-col]') as HTMLElement | null
    if (!cellEl) return
    const row = Number(cellEl.dataset.row)
    const col = Number(cellEl.dataset.col)
    setDrag(prev => prev && { ...prev, endRow: row, endCol: col })
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    openEditorFor(drag.startRow, drag.endRow, drag.startCol, drag.endCol)
    setDrag(null)
  }

  // minmax(...,1fr) instead of a flat px width — day columns keep their
  // legibility floor on a narrow viewport (where the grid still needs to
  // scroll horizontally, same as before) but stretch to absorb any leftover
  // width on a wide screen instead of leaving it empty on the right.
  const gridTemplateColumns = `${NAME_COL_WIDTH}px repeat(${days.length}, minmax(${DAY_COL_WIDTH}px, 1fr))`

  return (
    <div className="h-full overflow-auto rounded-xl border border-zinc-800">
      <div style={{ display: 'grid', gridTemplateColumns, width: '100%', minWidth: 'max-content' }}>
        {/* Frozen corner — sticky on both axes, unlike the week view (which
            only ever needs a top-sticky header since 7 columns never
            require horizontal scroll). */}
        <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 30, backgroundColor: '#161616' }}
          className="border-b border-r border-zinc-800" />
        {days.map(wd => (
          <div key={`h-${wd.day}`}
            ref={wd.isToday ? todayColRef : undefined}
            style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: wd.isToday ? '#111d11' : wd.isWeekend ? WEEKEND_HEADER_BG : '#161616' }}
            className="border-b border-zinc-800 px-0.5 py-1.5 text-center">
            <p className={`text-[8px] uppercase tracking-wide ${wd.isWeekend ? 'text-zinc-600' : 'text-zinc-500'}`}>{wd.dayName.slice(0, 2)}</p>
            <p className={`text-[11px] font-semibold ${wd.isToday ? 'text-emerald-400' : wd.isWeekend ? 'text-zinc-500' : 'text-zinc-300'}`}>{wd.day}</p>
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
                {/* Sticky positioning here (not on the row above) — that
                    outer div only exists to paint the full-width tint across
                    however far the row scrolls; its own left edge sits at
                    column 1 and never moves, so "sticky" on it was a no-op.
                    This inner label is the thing that actually needs to stay
                    pinned to the viewport's left edge while scrolling. */}
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
          const locked = !canEditCol(person)
          const isRowHighlighted = highlightedKey === personKey(person)

          return (
            <div key={`row-${rowIdx}`} style={{ display: 'contents' }}>
              <div
                title={person.emp}
                onClick={() => setHighlightedKey(k => k === personKey(person) ? null : personKey(person))}
                style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: isRowHighlighted ? ROW_HIGHLIGHT_NAME_BG : '#161616' }}
                className={`border-b border-r border-zinc-800 px-2 flex items-center text-xs font-medium truncate cursor-pointer transition-colors ${locked ? 'text-zinc-600' : 'text-zinc-300'} ${isRowHighlighted ? 'hover:brightness-110' : 'hover:bg-white/[0.03]'}`}>
                {displayNames.get(personKey(person)) ?? person.emp}
              </div>

              {days.map((wd, col) => {
                const key = weekDayCellKey(wd, person.id)
                const cell = data[key] ?? emptyCell()
                const isSelected = drag && rowIdx >= Math.min(drag.startRow, drag.endRow) && rowIdx <= Math.max(drag.startRow, drag.endRow) &&
                  col >= Math.min(drag.startCol, drag.endCol) && col <= Math.max(drag.startCol, drag.endCol)
                const cellBg = isSelected
                  ? SEL_BG
                  : isRowHighlighted
                  ? ROW_HIGHLIGHT_CELL_BG
                  : wd.isToday
                  ? 'rgba(58,145,63,0.06)'
                  : wd.isWeekend
                  ? WEEKEND_CELL_BG
                  : undefined

                return (
                  <div
                    key={key}
                    data-row={rowIdx}
                    data-col={col}
                    onPointerDown={e => handlePointerDown(e, person, rowIdx, col)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onDragStart={e => e.preventDefault()}
                    style={{
                      backgroundColor: cellBg,
                      outline: isSelected ? SEL_BDR : undefined,
                      outlineOffset: '-1px',
                      opacity: locked ? 0.45 : 1,
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                    className={`group relative border-b border-zinc-800/60 border-r h-7 flex items-center justify-center ${locked ? '' : 'cursor-pointer'}`}
                  >
                    {cell.value ? (
                      <span
                        className="w-full h-full flex items-center justify-center truncate text-[8px] font-semibold px-0.5"
                        style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                        title={cell.note ? `${cell.value} — ${cell.note}` : cell.value}
                      >
                        {cell.value}
                      </span>
                    ) : (
                      !locked && <span className="text-zinc-800 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">+</span>
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
