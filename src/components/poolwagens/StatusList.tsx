'use client'

import { Car, ChevronRight, LogIn } from 'lucide-react'
import { ACCENT, buttonCls, secondaryCls } from './ui'
import { NOW_COLOR, type CarNow } from '@/lib/poolwagens/status'

// "Nu": één regel per actieve wagen — naam en nummerplaat, de toestand in
// woorden en kleur, de volgende reservatie, en één snelle actie. Voor 6 tot
// 10 wagens past dit op desktop zonder scrollen; op een gsm is elke regel een
// aanraakdoel van minstens 44 px.

export default function StatusList({ rows, onDepart, onArrive, onDetails }: {
  rows: CarNow[]
  onDepart: (carId: string) => void
  onArrive: (reservationId: string) => void
  onDetails: (reservationId: string) => void
}) {
  return (
    <section aria-label="Nu" className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
      <h2 className="px-3 sm:px-4 pt-2.5 pb-1.5 text-[10px] uppercase tracking-widest text-zinc-500">Nu</h2>
      <ul className="divide-y divide-zinc-800/70">
        {rows.map(row => {
          const color = NOW_COLOR[row.kind]
          return (
            <li key={row.car.id}
              className="min-h-[52px] md:min-h-[40px] px-3 sm:px-4 py-1.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
              <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(150px,1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)] md:items-center md:gap-4">
                <div className="min-w-0 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-zinc-100 truncate">{row.car.name}</span>
                  <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">{row.car.license_plate}</span>
                </div>
                <div className="text-[13px] truncate" style={{ color }}>{row.label}</div>
                <div className="text-xs text-zinc-500 truncate">{row.nextLabel ?? ''}</div>
              </div>
              <Action row={row} onDepart={onDepart} onArrive={onArrive} onDetails={onDetails} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Action({ row, onDepart, onArrive, onDetails }: {
  row: CarNow
  onDepart: (carId: string) => void
  onArrive: (reservationId: string) => void
  onDetails: (reservationId: string) => void
}) {
  // Op een gsm minstens 44 px hoog; op desktop compact.
  const size = 'min-h-11 md:min-h-0 flex-shrink-0 justify-center'
  const a = row.action
  if (a.kind === 'vertrekken') {
    return (
      <button onClick={() => onDepart(row.car.id)} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: ACCENT }}>
        <Car size={13} /> Nu vertrekken
      </button>
    )
  }
  if (a.kind === 'aankomst') {
    return (
      <button onClick={() => onArrive(a.reservationId)} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: '#0284c7' }}>
        <LogIn size={13} /> Aankomst<span className="hidden md:inline"> registreren</span>
      </button>
    )
  }
  if (a.kind === 'details') {
    return (
      <button onClick={() => onDetails(a.reservationId)} className={`${secondaryCls} ${size}`}>
        Details <ChevronRight size={13} />
      </button>
    )
  }
  return null
}
