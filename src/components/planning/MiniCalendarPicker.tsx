'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DUTCH_MONTHS, getDaysInMonth } from '@/lib/planning-config'

// A clickable label that opens a small month calendar to jump straight to
// any date — replacing "step through every week one at a time" with
// "click the date you actually want."
export default function MiniCalendarPicker({
  anchor, onSelect, label,
}: {
  anchor: Date
  onSelect: (date: Date) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(anchor.getFullYear())
  const [viewMonth, setViewMonth] = useState(anchor.getMonth() + 1) // 1-12
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setViewYear(anchor.getFullYear()); setViewMonth(anchor.getMonth() + 1) }
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const days = getDaysInMonth(viewYear, viewMonth)
  // Monday-first, matching the rest of the app's weekday convention.
  const leadingBlanks = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) } else setViewMonth(m => m + 1)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold text-sh-grey min-w-[180px] justify-center hover:bg-zinc-800/60 transition-colors"
      >
        {label}
        <ChevronDown size={13} className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 w-64 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} aria-label="Vorige maand"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-sh-grey">{DUTCH_MONTHS[viewMonth - 1]} {viewYear}</span>
            <button onClick={nextMonth} aria-label="Volgende maand"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map(d => (
              <span key={d} className="text-[9px] text-zinc-600 text-center">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => <span key={`b${i}`} />)}
            {days.map(d => (
              <button
                key={d.day}
                onClick={() => { onSelect(new Date(viewYear, viewMonth - 1, d.day)); setOpen(false) }}
                className={`aspect-square rounded-lg text-xs flex items-center justify-center transition-colors hover:bg-zinc-800 ${
                  d.isToday ? 'text-emerald-400 font-semibold' : 'text-zinc-300'
                }`}
              >
                {d.day}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
