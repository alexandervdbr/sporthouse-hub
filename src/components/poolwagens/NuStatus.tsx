'use client'

import { Car, ChevronRight, LogIn } from 'lucide-react'
import { ACCENT, buttonCls, panelCls, secondaryCls } from './ui'
import { FuelPinButton, FuelTag } from './FuelCard'
import { canSeePin } from '@/lib/poolwagens/fuel-card'
import { NOW_COLOR, carsNow, type CarNow } from '@/lib/poolwagens/status'
import type { PoolPlanning } from '@/lib/poolwagens/types'

// "Nu": één kaart per actieve wagen met de toestand van dit moment, de
// volgende reservatie en één actie (src/lib/poolwagens/status.ts). Een vrije
// wagen voor later zoeken gebeurt in het reserveerformulier. Wie met de wagen
// onderweg is (en beheer) krijgt naast de actie een knop voor de pincode.
//
// Het wagenpark is klein (een handvol wagens), dus elke wagen krijgt een
// eigen kaart met de volledige naam: op een gsm onder elkaar, op desktop
// naast elkaar. De knoppen staan onderaan over de volle breedte van de kaart.

interface Props {
  planning: PoolPlanning
  userId: string
  canBook: boolean
  /** Beheer: ziet de pincode ook bij ritten van anderen. */
  manage: boolean
  onDepart: (carId: string) => void
  onArrive: (reservationId: string) => void
  onDetails: (reservationId: string) => void
}

export default function NuStatus({ planning, userId, canBook, manage, onDepart, onArrive, onDetails }: Props) {
  const rows = carsNow(planning, userId, new Date(planning.now), canBook)
  return (
    <section aria-label="Nu" className="space-y-2">
      <h2 className="px-1 text-[10px] uppercase tracking-widest text-zinc-500">Nu</h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map(row => (
          <CarCard key={row.car.id} row={row}
            pin={!!row.car.fuel_card_last4 && !!row.current && canSeePin(row.current, userId, manage)}
            action={action(row, onDepart, onArrive, onDetails)} />
        ))}
      </ul>
    </section>
  )
}

function CarCard({ row, pin, action }: { row: CarNow; pin: boolean; action: React.ReactNode }) {
  const color = NOW_COLOR[row.kind]
  return (
    <li className={`${panelCls} p-3 md:p-4 flex flex-col gap-3`} style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          <span className="mt-[7px] w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
          <h3 className="flex-1 min-w-0 text-[15px] font-semibold text-zinc-100 break-words">{row.car.name}</h3>
        </div>
        <div className="pl-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-mono text-zinc-400">{row.car.license_plate}</span>
          <FuelTag last4={row.car.fuel_card_last4} className="text-[11px]" />
        </div>
        <div className="pl-4 pt-1 text-[13px]" style={{ color }}>{row.label}</div>
        {row.nextLabel && <div className="pl-4 text-xs text-zinc-500">{row.nextLabel}</div>}
      </div>
      {(pin || action) && (
        // mt-auto: naast elkaar op desktop staan de knoppen van alle kaarten op dezelfde hoogte.
        <div className="mt-auto flex flex-col sm:flex-row gap-2">
          {pin && <FuelPinButton carId={row.car.id} last4={null} block className="sm:flex-1" />}
          {action && <div className="flex sm:flex-1">{action}</div>}
        </div>
      )}
    </li>
  )
}

const size = 'w-full min-h-11 md:min-h-9 justify-center'

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
