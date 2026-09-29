'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Check, Trash2 } from 'lucide-react'
import type { PlanningPreset } from '@/lib/planning-presets'
import { PLANNING_OPTIONS } from '@/lib/planning-config'
import type { CellData, WeekDay } from '@/lib/planning-week'

function sameDay(a: WeekDay, b: WeekDay) {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

// Same row/col rectangle math as MyMonthWeeks' main grid, applied to
// positions within the "Dagen" pool array (always rendered 7-wide) instead
// of the month's own flat day index — small enough to duplicate locally
// rather than share a module for one helper.
function rectIndices(aIdx: number, bIdx: number): number[] {
  const ar = Math.floor(aIdx / 7), ac = aIdx % 7
  const br = Math.floor(bIdx / 7), bc = bIdx % 7
  const r0 = Math.min(ar, br), r1 = Math.max(ar, br)
  const c0 = Math.min(ac, bc), c1 = Math.max(ac, bc)
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * 7 + c)
  return out
}

export interface StatusOption {
  name: string
  color: string
}

// Admin-defined presets are the real, editable status list (see
// PlanningConfigModal's Presets tab) — the old hardcoded PLANNING_OPTIONS
// (Verlof/Ziek/Recup/RBFA/…) fill in anything an admin hasn't added as a
// real preset yet, so the picker isn't empty on day one. A preset with the
// same name always wins (admin's own color, not the hardcoded one).
export function mergedStatusOptions(presets: PlanningPreset[]): StatusOption[] {
  const seen = new Set<string>()
  const result: StatusOption[] = []
  for (const p of presets) {
    seen.add(p.name.toUpperCase())
    result.push({ name: p.name, color: p.color })
  }
  for (const o of PLANNING_OPTIONS) {
    if (!seen.has(o.label.toUpperCase())) {
      seen.add(o.label.toUpperCase())
      result.push({ name: o.label, color: o.bgColor })
    }
  }
  // Alphabetical, not insertion order — with ~15 statuses now, "whatever
  // order they were added in" just reads as a random jumble.
  return result.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

// Exact match only — status and note are genuinely separate fields now
// (not a "STATUS - detail" string glued together), so there's no suffix
// parsing to get wrong.
function matchStatus(cell: CellData, options: StatusOption[]): string | null {
  const raw = cell.value.trim()
  if (!raw) return null
  for (const opt of options) {
    if (cell.bgColor === opt.color && raw.toUpperCase() === opt.name.toUpperCase()) return opt.name
  }
  return null
}

export default function DayEditor({
  title, subtitle, initialCell, presets, readOnly, onSave, onClear, onClose, dateEditor, emailToName,
}: {
  title: string
  subtitle?: string
  initialCell: CellData
  presets: PlanningPreset[]
  readOnly: boolean
  onSave: (cell: CellData) => void
  onClear: () => void
  onClose: () => void
  // Lets this popup show/adjust exactly which dates a save will apply to,
  // instead of the date set being frozen at whatever was selected before
  // opening it. Only meaningful for a caller dealing in a flat WeekDay set
  // for one fixed (dept, emp) — MyMonthWeeks' box/ctrl-click selection.
  dateEditor?: {
    pool: WeekDay[]
    selected: WeekDay[]
    onChange: (next: WeekDay[]) => void
  }
  // Resolves a stored updated_by email to a real name, so the "last edited"
  // trace reads "Robin B." instead of a raw email address.
  emailToName?: Map<string, string>
}) {
  const options = mergedStatusOptions(presets)
  const matchedStatus = matchStatus(initialCell, options)

  const [statusName, setStatusName] = useState<string | null>(matchedStatus)
  // Only meaningful once no status is picked — fully custom text, replacing
  // the whole value (matches today's plain-typing behaviour for anything
  // that doesn't fit a known status).
  const [customText, setCustomText] = useState(matchedStatus ? '' : initialCell.value)
  const [note, setNote] = useState(initialCell.note ?? '')

  // Drag/ctrl/shift-click on the "Dagen" pool, same gestures as the main
  // month grid — except there's no separate "commit vs. open editor" step
  // here, since we're already inside the editor: a plain drag just toggles
  // every day it touches, in whichever direction (add/remove) matches
  // whatever the day you started on already was.
  const [dateDrag, setDateDrag] = useState<{ start: number; addMode: boolean; cells: Set<number> } | null>(null)
  const dateAnchorRef = useRef<number | null>(null)

  function isPoolSelected(i: number) {
    if (!dateEditor) return false
    const wd = dateEditor.pool[i]
    return dateEditor.selected.some(s => sameDay(s, wd))
  }

  function applyDateCells(cells: Set<number>, addMode: boolean) {
    if (!dateEditor) return
    let next = dateEditor.selected
    for (const i of cells) {
      const wd = dateEditor.pool[i]
      const already = next.some(s => sameDay(s, wd))
      if (addMode && !already) next = [...next, wd]
      else if (!addMode && already) next = next.filter(s => !sameDay(s, wd))
    }
    dateEditor.onChange(next)
  }

  function handleDatePointerDown(e: React.PointerEvent, i: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (e.shiftKey && dateAnchorRef.current !== null) {
      applyDateCells(new Set(rectIndices(dateAnchorRef.current, i)), true)
      return
    }

    dateAnchorRef.current = i
    setDateDrag({ start: i, addMode: !isPoolSelected(i), cells: new Set([i]) })
  }

  function handleDatePointerMove(e: React.PointerEvent) {
    if (!dateDrag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest('[data-pool-idx]') as HTMLElement | null
    if (!cellEl) return
    const i = Number(cellEl.dataset.poolIdx)
    setDateDrag(prev => prev && { ...prev, cells: new Set(rectIndices(prev.start, i)) })
  }

  function handleDatePointerUp(e: React.PointerEvent) {
    if (!dateDrag) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* already released */ }
    applyDateCells(dateDrag.cells, dateDrag.addMode)
    setDateDrag(null)
  }

  function dateCellDisplaySelected(i: number) {
    if (dateDrag && dateDrag.cells.has(i)) return dateDrag.addMode
    return isPoolSelected(i)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedOption = options.find(o => o.name === statusName) ?? null

  // Only ever set on a genuinely single, previously-saved cell (see
  // CellData) — a multi-day/multi-person selection's initialCell is always
  // a fresh empty one, so this line simply doesn't appear for those.
  const lastEdited = initialCell.updatedBy
    ? {
        name: emailToName?.get(initialCell.updatedBy.trim().toLowerCase()) ?? initialCell.updatedBy,
        when: initialCell.updatedAt
          ? new Date(initialCell.updatedAt).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : null,
      }
    : null

  function handleSave() {
    const trimmedNote = note.trim() || null
    if (selectedOption) {
      onSave({ value: selectedOption.name.toUpperCase(), bold: true, textColor: '#ffffff', bgColor: selectedOption.color, note: trimmedNote })
      return
    }
    const value = customText.trim()
    if (!value) { onClear(); return }
    onSave({ value: value.toUpperCase(), bold: true, textColor: '#ffffff', bgColor: null, note: trimmedNote })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-zinc-900 border border-zinc-800 shadow-2xl max-h-[85dvh] flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-800 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {lastEdited && (
          <p className="px-5 pt-2.5 text-[10px] text-zinc-600 flex-shrink-0">
            Laatst gewijzigd door {lastEdited.name}{lastEdited.when && ` · ${lastEdited.when}`}
          </p>
        )}

        {readOnly ? (
          <div className="px-5 py-6 text-sm text-zinc-500">Je hebt geen rechten om dit te bewerken.</div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {dateEditor && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  Dagen ({dateEditor.selected.length})
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {dateEditor.pool.map((wd, i) => {
                    const isSel = dateCellDisplaySelected(i)
                    return (
                      <button
                        key={`${wd.year}-${wd.month}-${wd.day}`}
                        data-pool-idx={i}
                        onPointerDown={e => handleDatePointerDown(e, i)}
                        onPointerMove={handleDatePointerMove}
                        onPointerUp={handleDatePointerUp}
                        onDragStart={e => e.preventDefault()}
                        title={`${wd.dayName} ${wd.day} ${wd.month}`}
                        style={{
                          touchAction: 'none',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          backgroundColor: isSel ? '#3A913F' : 'rgba(255,255,255,0.04)',
                          color: isSel ? '#fff' : wd.isWeekend ? '#52525b' : '#a1a1aa',
                        }}
                        className="aspect-square rounded-md text-[11px] font-medium flex items-center justify-center transition-colors"
                      >
                        {wd.day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {options.map(opt => {
                  const active = statusName === opt.name
                  return (
                    <button
                      key={opt.name}
                      onClick={() => { setStatusName(active ? null : opt.name); setCustomText('') }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium truncate text-center transition-all"
                      style={active
                        ? { backgroundColor: opt.color, color: '#fff', border: `1px solid ${opt.color}` }
                        : { backgroundColor: `${opt.color}18`, border: `1px solid ${opt.color}55`, color: opt.color }}
                    >
                      {opt.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {!selectedOption && (
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                  Of typ iets anders
                </label>
                <input
                  type="text"
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  placeholder="Vrije tekst…"
                  className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                Notitie (optioneel)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="bv. F1 (RC Racing), 18u00 - 23u00…"
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Wordt getoond onder de status, telt niet mee als een eigen status.
              </p>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-between gap-2 flex-shrink-0">
            <button onClick={onClear} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors">
              <Trash2 size={13} /> Wissen
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                Annuleren
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#3A913F' }}>
                <Check size={14} /> Opslaan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
