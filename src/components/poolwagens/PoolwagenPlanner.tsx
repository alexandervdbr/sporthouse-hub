'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Car, ChevronLeft, ChevronRight, Flag, Loader2, Plus } from 'lucide-react'
import PoolwagenGrid, { STATE_COLOR, STATE_LABEL } from './PoolwagenGrid'
import ReservationDialog, { type ReservationDialogMode } from './ReservationDialog'
import ReservationDetail from './ReservationDetail'
import DamageDialog from './DamageDialog'
import { ACCENT, ErrorLine, PoolNav, buttonCls, secondaryCls, send } from './ui'
import type { PoolwagenAccess } from '@/lib/poolwagens/access'
import { monthDays, todayInBrussels } from '@/lib/gear/dates'
import { buildPoolGrid } from '@/lib/poolwagens/grid'
import { brusselsDayStartISO, formatPeriod, isoToBrusselsLocal } from '@/lib/poolwagens/time'
import { endangeredReservations, tripState } from '@/lib/poolwagens/trips'
import type { PoolOptions, PoolPlanning } from '@/lib/poolwagens/types'

// Het planningsoverzicht: één maand, een rij per poolwagen (zoals de
// materiaalplanner). Laadt per maand één keer alles in één verzoek, en
// opnieuw na een wijziging — geen timer.

const MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

type Dialog =
  | { kind: 'form'; mode: ReservationDialogMode }
  | { kind: 'detail'; id: string }
  | { kind: 'damage'; carId: string; reservationId: string | null }

/** Volgend heel uur vanaf nu, als Brusselse kloktijd. */
function nextHourLocal(now: Date, plusHours = 0) {
  const d = new Date(now.getTime())
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(d.getUTCHours() + 1 + plusHours)
  return isoToBrusselsLocal(d)
}

export default function PoolwagenPlanner({ userId, access }: { userId: string; access: PoolwagenAccess }) {
  const today = todayInBrussels()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)))
  const [planning, setPlanning] = useState<PoolPlanning | null>(null)
  const [options, setOptions] = useState<PoolOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const days = useMemo(() => monthDays(year, month), [year, month])
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const isCurrentMonth = today.startsWith(monthKey)

  useEffect(() => {
    send<PoolOptions>('/api/poolwagens/options', 'GET').then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    send<PoolPlanning>(`/api/poolwagens/planning?month=${monthKey}`, 'GET')
      .then(p => { if (alive) { setPlanning(p); setError('') } })
      .catch(e => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [monthKey, reload])

  const now = useMemo(() => (planning ? new Date(planning.now) : new Date()), [planning])
  const window_ = useMemo(() => ({
    startMs: Date.parse(brusselsDayStartISO(days[0])),
    endMs: Date.parse(brusselsDayStartISO(days[days.length - 1])) + 24 * 3600_000,
  }), [days])
  const rows = useMemo(() => (planning ? buildPoolGrid(planning, window_, userId, now) : []), [planning, window_, userId, now])
  const endangered = useMemo(() => (planning ? endangeredReservations(planning.reservations, now) : new Map()), [planning, now])

  const mine = useMemo(() => (planning?.reservations ?? [])
    .filter(r => r.user_id === userId && !r.arrived_at && (r.departed_at || Date.parse(r.end_at) > now.getTime()))
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    .slice(0, 6), [planning, userId, now])

  function shiftMonth(delta: number) {
    setLoading(true)
    const m = month - 1 + delta
    setYear(y => y + Math.floor(m / 12))
    setMonth(((m % 12) + 12) % 12 + 1)
  }
  function goToday() {
    if (!isCurrentMonth) setLoading(true)
    setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7)))
  }
  const refresh = () => { setDialog(null); setLoading(true); setReload(r => r + 1) }

  const onSelectRange = (carId: string, from: number, to: number) => {
    const startDay = days[from]
    const start = startDay === today ? nextHourLocal(new Date()) : `${startDay}T09:00`
    let end = `${days[to]}T17:00`
    if (end <= start) end = nextHourLocal(new Date(), 2)
    setDialog({ kind: 'form', mode: { kind: 'new', carId, start, end } })
  }

  const firstFree = rows.find(r => !r.block)?.car.id ?? rows[0]?.car.id ?? ''
  const noCars = planning && planning.cars.length === 0
  const open = dialog?.kind === 'detail' ? planning?.reservations.find(r => r.id === dialog.id) ?? null : null

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-zinc-100">Poolwagens</h1>
          <PoolNav current="planning" manage={access.manage} />
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} aria-label="Vorige maand" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft size={16} /></button>
            <span className="w-32 text-center text-sm font-medium text-zinc-200">{MONTHS[month - 1]} {year}</span>
            <button onClick={() => shiftMonth(1)} aria-label="Volgende maand" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronRight size={16} /></button>
            {!isCurrentMonth && <button onClick={goToday} className="ml-1 px-2.5 py-1 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800">Vandaag</button>}
            {loading && <Loader2 size={14} className="ml-2 animate-spin text-zinc-600" />}
          </div>
        </div>
        {!noCars && planning && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDialog({ kind: 'damage', carId: firstFree, reservationId: null })} className={secondaryCls}>
              <Flag size={13} /> Schade melden
            </button>
            <button onClick={() => setDialog({ kind: 'form', mode: { kind: 'now', carId: firstFree, end: nextHourLocal(new Date(), 3) } })}
              className={secondaryCls}><Car size={13} /> Nu vertrekken</button>
            <button onClick={() => setDialog({ kind: 'form', mode: { kind: 'new', carId: firstFree, start: nextHourLocal(new Date()), end: nextHourLocal(new Date(), 4) } })}
              className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}><Plus size={13} /> Reserveren</button>
          </div>
        )}
      </div>

      {(error || notice) && (
        <div className="px-4 sm:px-6 pt-3 space-y-2">
          <ErrorLine>{error}</ErrorLine>
          {notice && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-900/40 text-sm text-emerald-300">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="text-xs text-emerald-400/70 hover:text-emerald-200">Sluiten</button>
            </div>
          )}
        </div>
      )}

      {!planning ? (
        <div className="p-8">{!error && <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
      ) : noCars ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center border border-zinc-800 bg-zinc-900"><Car size={20} className="text-zinc-500" /></div>
            <h2 className="text-base font-semibold text-zinc-100">Nog geen poolwagens</h2>
            <p className="mt-1.5 text-sm text-zinc-500">
              {access.manage ? 'Voeg de wagens toe in Beheer; daarna kan iedereen hier reserveren.' : 'Zodra een beheerder de wagens heeft ingegeven, kan je hier reserveren.'}
            </p>
            {access.manage && <Link href="/poolwagens/beheer" className="inline-flex mt-5 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: ACCENT }}>Naar Beheer</Link>}
          </div>
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <div className="flex-shrink-0 px-4 sm:px-6 pt-3 flex flex-wrap gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 self-center mr-1">Mijn ritten</span>
              {mine.map(r => {
                const state = tripState(r, now)
                const car = planning.cars.find(c => c.id === r.car_id)
                return (
                  <button key={r.id} onClick={() => setDialog({ kind: 'detail', id: r.id })}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs hover:bg-zinc-800/60"
                    style={{ borderColor: `${STATE_COLOR[state]}80`, color: STATE_COLOR[state] }}>
                    <span className="font-semibold">{car?.name ?? 'Wagen'}</span>
                    <span className="text-zinc-400">{formatPeriod(r.start_at, r.end_at)}</span>
                    <span>{state === 'gepland' ? 'Vertrek registreren' : state === 'teruggebracht' ? STATE_LABEL[state] : 'Aankomst registreren'}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex-shrink-0 px-4 sm:px-6 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            {(Object.keys(STATE_COLOR) as (keyof typeof STATE_COLOR)[]).map(s => (
              <span key={s} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_COLOR[s] }} />{STATE_LABEL[s]}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-red-500" />In het gedrang</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.5) 0 2px, transparent 2px 4px)' }} />Geblokkeerd</span>
          </div>
          <div className="flex-1 overflow-auto">
            <PoolwagenGrid days={days} today={today} rows={rows} canBook={access.use}
              onSelectRange={onSelectRange} onOpenReservation={id => setDialog({ kind: 'detail', id })} />
          </div>
        </>
      )}

      {planning && dialog?.kind === 'form' && (
        <ReservationDialog mode={dialog.mode} planning={planning} options={options} onClose={() => setDialog(null)}
          onSaved={() => { setNotice(dialog.mode.kind === 'now' ? 'Goede rit! Het vertrek is geregistreerd.' : 'Opgeslagen.'); refresh() }} />
      )}
      {planning && open && (
        <ReservationDetail
          reservation={open}
          car={planning.cars.find(c => c.id === open.car_id) ?? null}
          block={rows.find(r => r.car.id === open.car_id)?.block ?? null}
          endangered={endangered.has(open.id)}
          userId={userId}
          manage={access.manage}
          now={now}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: 'form', mode: { kind: 'edit', reservation: open } })}
          onReportDamage={() => setDialog({ kind: 'damage', carId: open.car_id, reservationId: open.id })}
          onChanged={() => { setNotice('Opgeslagen.'); refresh() }}
        />
      )}
      {planning && dialog?.kind === 'damage' && (
        <DamageDialog cars={planning.cars} carId={dialog.carId} reservationId={dialog.reservationId}
          onClose={() => setDialog(null)} onSaved={msg => { setNotice(msg); refresh() }} />
      )}
    </div>
  )
}
