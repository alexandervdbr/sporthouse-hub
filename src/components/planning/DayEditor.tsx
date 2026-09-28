'use client'

import { useEffect, useState } from 'react'
import { X, Check, Trash2 } from 'lucide-react'
import type { PlanningPreset } from '@/lib/planning-presets'
import { PLANNING_OPTIONS } from '@/lib/planning-config'
import type { CellData } from '@/lib/planning-week'

interface StatusOption {
  name: string
  color: string
}

// Admin-defined presets are the real, editable status list (see
// PlanningConfigModal's Presets tab) — the old hardcoded PLANNING_OPTIONS
// (Verlof/Ziek/Recup/RBFA/…) fill in anything an admin hasn't added as a
// real preset yet, so the picker isn't empty on day one. A preset with the
// same name always wins (admin's own color, not the hardcoded one).
function mergedStatusOptions(presets: PlanningPreset[]): StatusOption[] {
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
  title, subtitle, initialCell, presets, readOnly, onSave, onClear, onClose,
}: {
  title: string
  subtitle?: string
  initialCell: CellData
  presets: PlanningPreset[]
  readOnly: boolean
  onSave: (cell: CellData) => void
  onClear: () => void
  onClose: () => void
}) {
  const options = mergedStatusOptions(presets)
  const matchedStatus = matchStatus(initialCell, options)

  const [statusName, setStatusName] = useState<string | null>(matchedStatus)
  // Only meaningful once no status is picked — fully custom text, replacing
  // the whole value (matches today's plain-typing behaviour for anything
  // that doesn't fit a known status).
  const [customText, setCustomText] = useState(matchedStatus ? '' : initialCell.value)
  const [note, setNote] = useState(initialCell.note ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedOption = options.find(o => o.name === statusName) ?? null

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

        {readOnly ? (
          <div className="px-5 py-6 text-sm text-zinc-500">Je hebt geen rechten om dit te bewerken.</div>
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
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
