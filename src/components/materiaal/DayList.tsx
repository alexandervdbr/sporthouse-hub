'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Package, Plus } from 'lucide-react'
import { Button } from '@/components/materiaal/ui'
import { barLabel } from '@/lib/gear/labels'
import type { GearBooking, GearCatalog } from '@/lib/gear/types'

// Op een telefoon past het raster niet. Daar: een strook met de dagen van de
// maand, en per gekozen dag de boekingen — met de kits en losse items erin.

interface Props {
  days: string[]
  today: string
  day: string
  onDay: (iso: string) => void
  catalog: GearCatalog
  bookings: GearBooking[]
  canBook: boolean
  onBook: (iso: string) => void
  onOpenBooking: (bookingId: string) => void
}

export default function DayList({ days, today, day, onDay, catalog, bookings, canBook, onBook, onOpenBooking }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const items = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items])

  // De gekozen dag in beeld schuiven; anders opent de maand op de 1e.
  useEffect(() => {
    const strip = stripRef.current, btn = selectedRef.current
    if (strip && btn) strip.scrollLeft = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2
  }, [day])

  const on = (iso: string) => bookings.filter(b => b.start_date <= iso && iso <= b.end_date)
  const dayBookings = on(day)

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div ref={stripRef} className="overflow-x-auto flex-shrink-0 -mx-1 px-1">
        <div className="flex gap-1.5 pb-1">
          {days.map(iso => {
            const d = new Date(`${iso}T12:00:00`)
            const selected = iso === day
            const count = on(iso).length
            return (
              <button key={iso} ref={selected ? selectedRef : undefined} onClick={() => onDay(iso)} aria-pressed={selected}
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

      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <span className="min-w-0 truncate text-sm font-semibold text-zinc-200">
          {new Date(`${day}T12:00:00`).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {canBook && day >= today && (
          <Button size="sm" onClick={() => onBook(day)}><Plus size={13} /> Boeken</Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-4 space-y-2">
        {dayBookings.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">Niets weg op deze dag.</p>
        ) : dayBookings.map(b => {
          const label = barLabel({ personName: b.external_name ?? b.person_name, clientName: b.client?.name, clientColor: b.client?.color })
          const viaKits = [...new Set(b.lines.map(l => l.via_kit_name).filter((n): n is string => !!n))]
          const loose = b.lines.filter(l => !l.via_kit_id).map(l => items.get(l.item_id)?.name).filter(Boolean)
          return (
            <button key={b.id} onClick={() => onOpenBooking(b.id)}
              className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex items-start gap-3">
              <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-100 truncate">{label.text}</span>
                {viaKits.map(k => (
                  <span key={k} className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300 min-w-0" title={k}><Package size={11} className="text-zinc-500 flex-shrink-0" /><span className="truncate">{k}</span></span>
                ))}
                {loose.length > 0 && <span className="mt-1 block text-xs text-zinc-400">{loose.join(' · ')}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
