'use client'

import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import type { GridGroup } from '@/lib/gear/grid'

// Op een telefoon past het raster niet. Daar: een strook met de dagen van de
// maand, en per gekozen dag wat er weg is.

interface Props {
  days: string[]
  today: string
  day: string
  onDay: (iso: string) => void
  groups: GridGroup[]
  canBook: boolean
  onBook: (iso: string) => void
  onOpenBooking: (bookingId: string) => void
}

export default function DayList({ days, today, day, onDay, groups, canBook, onBook, onOpenBooking }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const index = days.indexOf(day)

  // De gekozen dag in beeld schuiven; anders opent de maand op de 1e.
  useEffect(() => {
    const strip = stripRef.current, btn = selectedRef.current
    if (strip && btn) strip.scrollLeft = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2
  }, [day])

  const outOn = (i: number) => groups.flatMap(g => g.rows
    .flatMap(r => r.bars.filter(b => i >= b.startIndex && i < b.startIndex + b.span).map(bar => ({ row: r, bar, color: g.category.color }))))

  const today_ = outOn(index)

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div ref={stripRef} className="overflow-x-auto flex-shrink-0 -mx-1 px-1">
        <div className="flex gap-1.5 pb-1">
          {days.map((iso, i) => {
            const d = new Date(`${iso}T12:00:00`)
            const selected = iso === day
            const count = outOn(i).length
            return (
              <button key={iso} ref={selected ? selectedRef : undefined} onClick={() => onDay(iso)}
                aria-pressed={selected}
                className={`relative flex-shrink-0 w-11 py-1.5 rounded-lg border text-center ${selected
                  ? 'bg-zinc-700 border-zinc-500 text-white'
                  : iso === today ? 'bg-[#111d11] border-[#3A913F]/50 text-zinc-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                <span className="block text-[9px] uppercase opacity-70">{d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2)}</span>
                <span className="block text-sm font-semibold leading-tight">{d.getDate()}</span>
                {count > 0 && !selected && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#3A913F] text-[9px] font-bold text-white flex items-center justify-center">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-semibold text-zinc-200">
          {new Date(`${day}T12:00:00`).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {canBook && day >= today && (
          <button onClick={() => onBook(day)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-200">
            <Plus size={13} /> Boeken
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-4 space-y-2">
        {today_.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">Niets weg op deze dag.</p>
        ) : today_.map(({ row, bar, color }) => (
          <button key={`${row.unit.id}-${bar.bookingId}`} onClick={() => onOpenBooking(bar.bookingId)}
            className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex items-start gap-3">
            <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-100 truncate">{row.unit.name}</span>
              <span className="mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: bar.color }} />
                <span className="text-xs text-zinc-400 truncate">{bar.text}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
