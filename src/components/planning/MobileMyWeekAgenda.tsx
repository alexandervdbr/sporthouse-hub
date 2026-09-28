'use client'

import { useState } from 'react'
import { MoreVertical, Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { DUTCH_MONTHS } from '@/lib/planning-config'
import { emptyCell, weekDayCellKey, type CellData, type PlanningWeekData, type WeekDay } from '@/lib/planning-week'
import type { PlanningPreset } from '@/lib/planning-presets'
import DayEditor from './DayEditor'

// Mobile version of "Mijn week" — a 7-column grid doesn't fit a phone
// screen at any density, so this is a vertical stack of day-cards instead.
// Same data, same editor, same copy/paste — just shaped for the screen.
export default function MobileMyWeekAgenda({
  week, dept, emp, data, readOnly, presets, onApply, onClear,
}: {
  week: WeekDay[]
  dept: string
  emp: string
  data: PlanningWeekData
  readOnly: boolean
  presets: PlanningPreset[]
  onApply: (targets: { wd: WeekDay; dept: string; emp: string }[], value: CellData) => void
  onClear: (targets: { wd: WeekDay; dept: string; emp: string }[]) => void
}) {
  const [editingWd, setEditingWd] = useState<WeekDay | null>(null)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<CellData | null>(null)

  return (
    <div className="space-y-2">
      {week.map(wd => {
        const key = weekDayCellKey(wd, dept, emp)
        const cell = data[key] ?? emptyCell()
        const menuOpen = menuKey === key
        return (
          <div key={key}
            className="relative flex items-center gap-3 px-4 py-3 rounded-xl border"
            style={{
              backgroundColor: wd.isToday ? 'rgba(58,145,63,0.08)' : 'rgba(255,255,255,0.03)',
              borderColor: wd.isToday ? 'rgba(58,145,63,0.35)' : 'rgba(255,255,255,0.08)',
            }}
          >
            <button
              onClick={() => !readOnly && setEditingWd(wd)}
              className="flex-1 flex items-center gap-3 text-left min-w-0"
            >
              <div className="flex flex-col items-center w-11 flex-shrink-0">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">{wd.dayName.slice(0, 2)}</span>
                <span className={`text-base font-semibold ${wd.isToday ? 'text-emerald-400' : 'text-zinc-200'}`}>{wd.day}</span>
              </div>
              {cell.value ? (
                <div className="flex-1 min-w-0 space-y-0.5">
                  <span
                    className="block truncate rounded-md px-2.5 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: cell.bgColor ?? 'rgba(255,255,255,0.08)', color: cell.bgColor ? '#fff' : '#a1a1aa' }}
                  >
                    {cell.value}
                  </span>
                  {cell.note && <span className="block truncate text-[10px] text-zinc-500 px-0.5">{cell.note}</span>}
                </div>
              ) : (
                <span className="flex-1 text-xs text-zinc-600">{readOnly ? '—' : 'Tik om in te vullen'}</span>
              )}
            </button>

            {!readOnly && (
              <button
                onClick={() => setMenuKey(m => m === key ? null : key)}
                aria-label="Meer opties"
                className="tap-target p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors flex-shrink-0"
              >
                <MoreVertical size={14} />
              </button>
            )}

            {menuOpen && (
              <div className="absolute right-2 top-full mt-1 z-30 w-40 rounded-lg overflow-hidden shadow-2xl bg-zinc-800 border border-zinc-700">
                <button
                  onClick={() => { setClipboard(cell); setMenuKey(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  <Copy size={12} /> Kopiëren
                </button>
                <button
                  onClick={() => { if (clipboard) onApply([{ wd, dept, emp }], clipboard); setMenuKey(null) }}
                  disabled={!clipboard}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ClipboardPaste size={12} /> Plakken
                </button>
                {cell.value && (
                  <button
                    onClick={() => { onClear([{ wd, dept, emp }]); setMenuKey(null) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors"
                  >
                    <Trash2 size={12} /> Wissen
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {editingWd && (
        <DayEditor
          title={`${editingWd.dayName} ${editingWd.day} ${DUTCH_MONTHS[editingWd.month - 1]}`}
          initialCell={data[weekDayCellKey(editingWd, dept, emp)] ?? emptyCell()}
          presets={presets}
          readOnly={readOnly}
          onSave={cell => { onApply([{ wd: editingWd, dept, emp }], cell); setEditingWd(null) }}
          onClear={() => { onClear([{ wd: editingWd, dept, emp }]); setEditingWd(null) }}
          onClose={() => setEditingWd(null)}
        />
      )}
    </div>
  )
}
