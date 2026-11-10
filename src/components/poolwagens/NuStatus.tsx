'use client'

import { Car, ChevronRight, LogIn } from 'lucide-react'
import { ACCENT, actionCls, buttonCls, panelCls, secondaryCls } from './ui'
import { FuelTag } from './FuelCard'
import { NOW_COLOR, carsNow, type CarNow } from '@/lib/poolwagens/status'
import type { PoolPlanning } from '@/lib/poolwagens/types'

// "Nu": één regel per actieve wagen met de toestand van dit moment, de
// volgende reservatie en één actie (src/lib/poolwagens/status.ts). Een vrije
// wagen voor later zoeken gebeurt in het reserveerformulier.

interface Props {
  planning: PoolPlanning
  userId: string
  canBook: boolean
  onDepart: (carId: string) => void
  onArrive: (reservationId: string) => void
  onDetails: (reservationId: string) => void
}

export default function NuStatus({ planning, userId, canBook, onDepart, onArrive, onDetails }: Props) {
  const rows = carsNow(planning, userId, new Date(planning.now), canBook)
  return (
    <section aria-label="Nu" className={`${panelCls} overflow-hidden`}>
      <h2 className="px-3 md:px-4 pt-3 pb-2 text-[10px] uppercase tracking-widest text-zinc-500">Nu</h2>
      <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
        {rows.map(row => <Row key={row.car.id} row={row} action={action(row, onDepart, onArrive, onDetails)} />)}
      </ul>
    </section>
  )
}

function Row({ row, action }: { row: CarNow; action: React.ReactNode }) {
  const color = NOW_COLOR[row.kind]
  return (
    <li className="min-h-[52px] md:min-h-[40px] px-3 md:px-4 py-1.5 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
      {/* Gsm: onder elkaar. Desktop: naam, toestand en "Volgende" naast elkaar, de knop rechts. */}
      <div className="min-w-0 flex-1 md:flex md:items-baseline md:gap-x-4">
        <div className="min-w-0 md:flex-shrink-0 flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-100 truncate">{row.car.name}</span>
          <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">{row.car.license_plate}</span>
          <FuelTag last4={row.car.fuel_card_last4} />
        </div>
        <div className="text-[13px] truncate md:flex-shrink-0" style={{ color }}>{row.label}</div>
        <div className="text-xs text-zinc-500 truncate md:min-w-0">{row.nextLabel ?? ''}</div>
      </div>
      {action}
    </li>
  )
}

const size = `${actionCls} flex-shrink-0`

function action(row: CarNow, onDepart: (id: string) => void, onArrive: (id: string) => void, onDetails: (id: string) => void) {
  const a = row.action
  if (a.kind === 'vertrekken') {
    return <button onClick={() => onDepart(row.car.id)} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: ACCENT }}><Car size={13} /> Nu vertrekken</button>
  }
  if (a.kind === 'aankomst') {
    return <button onClick={() => onArrive(a.reservationId)} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: '#0284c7' }}><LogIn size={13} /> Aankomst</button>
  }
  if (a.kind === 'details') return <button onClick={() => onDetails(a.reservationId)} className={`${secondaryCls} ${size}`}>Details <ChevronRight size={13} /></button>
  return null
}
