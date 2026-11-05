'use client'

import { useState } from 'react'
import { Car, CalendarPlus, ChevronRight, Loader2, LogIn } from 'lucide-react'
import { ACCENT, ErrorLine, actionCls, buttonCls, inputCls, labelCls, panelCls, secondaryCls, send } from './ui'
import { diffDays } from '@/lib/gear/dates'
import { MAX_RANGE_DAYS } from '@/lib/poolwagens/planning-range'
import {
  NOW_COLOR, PERIOD_LABEL, carsInPeriod, carsNow, presetPeriod,
  type CarInPeriod, type CarNow, type PeriodChoice, type PeriodKind,
} from '@/lib/poolwagens/status'
import { brusselsLocalToISO, formatPeriod } from '@/lib/poolwagens/time'
import type { PoolCar, PoolPlanning } from '@/lib/poolwagens/types'

// "Beschikbaarheid": één regel per actieve wagen. Bij "Nu" de toestand van
// dit moment en de volgende reservatie; bij Straks, Morgen of een gekozen
// periode of de wagen dan vrij is, met de vrije bovenaan. Overlap en blokkade
// met dezelfde pure functies als de server (src/lib/poolwagens/status.ts).
// Straks en Morgen gebruiken de planning die al geladen is (die bevat alles
// van nu tot 30 dagen vooruit); een gekozen periode wordt één keer opgehaald.

const PERIOD_COLOR: Record<PeriodKind, string> = { vrij: '#3A913F', bezet: '#eab308', geblokkeerd: '#ef4444' }
const CHOICES: PeriodChoice[] = ['nu', 'straks', 'morgen', 'kies']

interface Props {
  planning: PoolPlanning
  userId: string
  canBook: boolean
  onDepart: (carId: string) => void
  onReserve: (carId: string, start: string, end: string) => void
  onArrive: (reservationId: string) => void
  onDetails: (reservationId: string) => void
}

export default function Beschikbaarheid({ planning, userId, canBook, onDepart, onReserve, onArrive, onDetails }: Props) {
  const now = new Date(planning.now)
  const [choice, setChoice] = useState<PeriodChoice>('nu')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [custom, setCustom] = useState<{ planning: PoolPlanning; start: string; end: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function pick(c: PeriodChoice) {
    setChoice(c)
    setError('')
    if (c === 'kies' && !start) {
      const p = presetPeriod('straks', now)
      setStart(p.start); setEnd(p.end)
    }
  }

  const startISO = brusselsLocalToISO(start)
  const endISO = brusselsLocalToISO(end)
  const problem = !startISO || !endISO ? 'Kies een vertrek en een verwachte terugkomst.'
    : Date.parse(endISO) <= Date.parse(startISO) ? 'De terugkomst ligt na het vertrek.'
    : diffDays(start.slice(0, 10), end.slice(0, 10)) + 1 > MAX_RANGE_DAYS ? `Kies een periode van hoogstens ${MAX_RANGE_DAYS} dagen.`
    : null

  async function show() {
    if (problem) return
    setBusy(true)
    setError('')
    try {
      const p = await send<PoolPlanning>(`/api/poolwagens/planning?from=${start.slice(0, 10)}&to=${end.slice(0, 10)}`, 'GET')
      setCustom({ planning: p, start, end })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // De periode die nu getoond wordt (null bij "Nu", of als "Kies periode" nog niet opgehaald is).
  const period = choice === 'straks' || choice === 'morgen' ? { ...presetPeriod(choice, now), planning }
    : choice === 'kies' && custom && custom.start === start && custom.end === end ? custom
    : null

  return (
    <section aria-label="Beschikbaarheid" className={`${panelCls} overflow-hidden`}>
      <div className="px-3 md:px-4 pt-3 pb-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Beschikbaarheid</h2>
        <div role="tablist" aria-label="Periode" className="grid grid-cols-4 w-full md:w-fit p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
          {CHOICES.map(c => (
            <button key={c} role="tab" aria-selected={choice === c} onClick={() => pick(c)}
              className={`px-2 md:px-3 py-2 md:py-1 rounded-md text-xs font-medium truncate ${choice === c ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {PERIOD_LABEL[c]}
            </button>
          ))}
        </div>
        {period && (
          <span className="text-xs text-zinc-500">{formatPeriod(brusselsLocalToISO(period.start)!, brusselsLocalToISO(period.end)!)}</span>
        )}
      </div>

      {choice === 'kies' && (
        <div className="px-3 md:px-4 pb-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 md:items-end">
            <div>
              <label className={labelCls}>Vertrek</label>
              <input type="datetime-local" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Verwachte terugkomst</label>
              <input type="datetime-local" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <button onClick={show} disabled={busy || !!problem}
              className={`${buttonCls} ${actionCls} md:min-h-[38px] text-white`} style={{ backgroundColor: ACCENT }}>
              {busy && <Loader2 size={14} className="animate-spin" />} Toon
            </button>
          </div>
          <ErrorLine>{problem && (start || end) ? problem : error}</ErrorLine>
        </div>
      )}

      {choice === 'nu' ? (
        <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
          {carsNow(planning, userId, now, canBook).map(row => (
            <Row key={row.car.id} car={row.car} color={NOW_COLOR[row.kind]} label={row.label} sub={row.nextLabel}
              action={nowAction(row, onDepart, onArrive, onDetails)} />
          ))}
        </ul>
      ) : period ? (
        <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
          {carsInPeriod(period.planning, brusselsLocalToISO(period.start)!, brusselsLocalToISO(period.end)!, userId, now, canBook).map(row => (
            <Row key={row.car.id} car={row.car} color={PERIOD_COLOR[row.kind]} label={row.label}
              sub={row.notBack ? 'Nog niet terug van de vorige rit.' : null}
              action={periodAction(row, () => onReserve(row.car.id, period.start, period.end), onArrive, onDetails)} />
          ))}
        </ul>
      ) : (
        choice === 'kies' && !problem && <p className="px-3 md:px-4 pb-3 text-xs text-zinc-500">Klik op Toon voor deze periode.</p>
      )}
    </section>
  )
}

function Row({ car, color, label, sub, action }: { car: PoolCar; color: string; label: string; sub: string | null; action: React.ReactNode }) {
  return (
    <li className="min-h-[52px] md:min-h-[40px] px-3 md:px-4 py-1.5 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(150px,1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)] md:items-center md:gap-4">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-100 truncate">{car.name}</span>
          <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">{car.license_plate}</span>
        </div>
        <div className="text-[13px] truncate" style={{ color }}>{label}</div>
        <div className="text-xs text-zinc-500 truncate">{sub ?? ''}</div>
      </div>
      {action}
    </li>
  )
}

const size = `${actionCls} flex-shrink-0`

function nowAction(row: CarNow, onDepart: (id: string) => void, onArrive: (id: string) => void, onDetails: (id: string) => void) {
  const a = row.action
  if (a.kind === 'vertrekken') return <Primary onClick={() => onDepart(row.car.id)}><Car size={13} /> Nu vertrekken</Primary>
  if (a.kind === 'aankomst') return <Arrive onClick={() => onArrive(a.reservationId)} />
  if (a.kind === 'details') return <Details onClick={() => onDetails(a.reservationId)} />
  return null
}

function periodAction(row: CarInPeriod, onReserve: () => void, onArrive: (id: string) => void, onDetails: (id: string) => void) {
  const a = row.action
  if (a.kind === 'reserveren') return <Primary onClick={onReserve}><CalendarPlus size={13} /> Reserveren</Primary>
  if (a.kind === 'aankomst') return <Arrive onClick={() => onArrive(a.reservationId)} />
  if (a.kind === 'details') return <Details onClick={() => onDetails(a.reservationId)} />
  return null
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: ACCENT }}>{children}</button>
}

function Arrive({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${buttonCls} ${size} text-white`} style={{ backgroundColor: '#0284c7' }}>
      <LogIn size={13} /> Aankomst
    </button>
  )
}

function Details({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className={`${secondaryCls} ${size}`}>Details <ChevronRight size={13} /></button>
}
