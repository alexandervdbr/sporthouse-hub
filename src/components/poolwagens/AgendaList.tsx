'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { inputCls } from './ui'
import { STATE_COLOR } from './PoolwagenGrid'
import type { AgendaDay } from '@/lib/poolwagens/agenda'
import type { PoolCar } from '@/lib/poolwagens/types'

// De planning op een gsm: geen raster, maar een agenda per dag voor één week
// ("Vandaag", "Morgen", "Vr 7/11"…), met per rit de tijd, de wagen, de
// voornaam en de klant. Bovenaan een filter per wagen en bladeren per week.
// Zoals DayList in de materiaalplanner: een lijst die op een smal scherm past.

export default function AgendaList({ days, title, cars, carId, onCar, onShift, onToday, showToday, onOpen }: {
  days: AgendaDay[]
  title: string
  cars: PoolCar[]
  carId: string
  onCar: (carId: string) => void
  onShift: (delta: number) => void
  onToday: () => void
  showToday: boolean
  onOpen: (reservationId: string) => void
}) {
  return (
    <section aria-label="Agenda" className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => onShift(-1)} aria-label="Vorige week"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 active:bg-zinc-800"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-sm font-medium text-zinc-200 truncate">{title}</div>
          {showToday && <button onClick={onToday} className="text-xs text-emerald-400 py-0.5">Naar vandaag</button>}
        </div>
        <button onClick={() => onShift(1)} aria-label="Volgende week"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 active:bg-zinc-800"><ChevronRight size={18} /></button>
      </div>

      <select className={inputCls} value={carId} onChange={e => onCar(e.target.value)} aria-label="Wagen">
        <option value="">Alle wagens</option>
        {cars.map(c => <option key={c.id} value={c.id}>{c.name} — {c.license_plate}</option>)}
      </select>

      <ol className="space-y-3">
        {days.map(d => (
          <li key={d.day}>
            <h3 className="px-1 pb-1 text-[11px] uppercase tracking-widest text-zinc-500">{d.label}</h3>
            {d.entries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-600 rounded-lg border border-zinc-900">Geen ritten</p>
            ) : (
              <ul className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/70 overflow-hidden">
                {d.entries.map(e => {
                  const color = STATE_COLOR[e.state]
                  return (
                    <li key={e.reservation.id}>
                      <button onClick={() => onOpen(e.reservation.id)}
                        className="w-full min-h-[52px] px-3 py-2 flex items-center gap-3 text-left active:bg-zinc-800/60">
                        <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium tabular-nums" style={{ color }}>{e.time}</div>
                          <div className="text-sm text-zinc-200 truncate">
                            {e.car.name} · {e.person}{e.reservation.client_name ? ` · ${e.reservation.client_name}` : ''}
                          </div>
                        </div>
                        <ChevronRight size={15} className="text-zinc-600 flex-shrink-0" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
