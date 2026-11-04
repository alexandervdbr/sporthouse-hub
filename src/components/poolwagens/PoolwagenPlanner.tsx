'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Car, ChevronLeft, ChevronRight, Flag, Loader2, Plus } from 'lucide-react'
import PoolwagenGrid, { STATE_COLOR, STATE_LABEL } from './PoolwagenGrid'
import ReservationDialog, { type ReservationDialogMode } from './ReservationDialog'
import ReservationDetail from './ReservationDetail'
import DamageDialog from './DamageDialog'
import StatusList from './StatusList'
import FreeCarFinder from './FreeCarFinder'
import AgendaList from './AgendaList'
import { ACCENT, ErrorLine, Notice, PoolNav, buttonCls, newNotice, secondaryCls, send } from './ui'
import type { PoolwagenAccess } from '@/lib/poolwagens/access'
import { addDays, eachDay, todayInBrussels } from '@/lib/gear/dates'
import { buildAgenda } from '@/lib/poolwagens/agenda'
import { buildPoolGrid } from '@/lib/poolwagens/grid'
import { carsNow, isMine } from '@/lib/poolwagens/status'
import { formatPeriod, mondayOf, nextHourLocal, shortDayLabel } from '@/lib/poolwagens/time'
import { endangeredReservations, tripState } from '@/lib/poolwagens/trips'
import {
  DEFAULT_VIEW, VIEWS, columnIsPast, loadView, nowPercent, saveView, selectionToPeriod, shiftAnchor, viewWindow,
  type PoolView,
} from '@/lib/poolwagens/views'
import type { PoolOptions, PoolPlanning } from '@/lib/poolwagens/types'

// De planningspagina, van boven naar onder:
//   1. "Mijn ritten" en de statuslijst "Nu" (een regel per wagen);
//   2. "Vind een vrije wagen";
//   3. desktop: het raster in Dag, Week (standaard) of Maand;
//      gsm (< 768 px): een agenda per dag, per week te bladeren, met een vaste
//      balk onderaan voor Reserveren en Nu vertrekken.
// Eén verzoek per venster, en opnieuw na een wijziging — geen timer.

type Dialog =
  | { kind: 'form'; mode: ReservationDialogMode }
  | { kind: 'detail'; id: string; initialForm?: 'vertrek' | 'aankomst' }
  | { kind: 'damage'; carId: string; reservationId: string | null }

const VIEW_LABEL: Record<PoolView, string> = { dag: 'Dag', week: 'Week', maand: 'Maand' }

// ── De gekozen weergave, onthouden per gebruiker ────────────────────────────
// Via useSyncExternalStore: op de server (en bij de eerste render) Week, in de
// browser wat in localStorage staat. Lukt opslaan niet, dan onthoudt dit
// tabblad het toch.
const viewListeners = new Set<() => void>()
let viewInMemory: PoolView | null = null
function usePoolView(userId: string): [PoolView, (v: PoolView) => void] {
  const view = useSyncExternalStore(
    cb => { viewListeners.add(cb); return () => { viewListeners.delete(cb) } },
    () => viewInMemory ?? loadView(userId),
    () => DEFAULT_VIEW,
  )
  const set = useCallback((v: PoolView) => {
    viewInMemory = v
    saveView(userId, v)
    viewListeners.forEach(l => l())
  }, [userId])
  return [view, set]
}

export default function PoolwagenPlanner({ userId, access }: { userId: string; access: PoolwagenAccess }) {
  const today = todayInBrussels()
  const [view, setView] = usePoolView(userId)
  const [anchor, setAnchor] = useState(today)
  const [agendaCar, setAgendaCar] = useState('')
  const [planning, setPlanning] = useState<PoolPlanning | null>(null)
  const [options, setOptions] = useState<PoolOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null)
  const [error, setError] = useState('')

  const win = useMemo(() => viewWindow(view, anchor, today), [view, anchor, today])
  // De agenda op de gsm toont de week van hetzelfde ankerpunt.
  const agendaDays = useMemo(() => eachDay(mondayOf(anchor), addDays(mondayOf(anchor), 6)), [anchor])
  // Eén verzoek voor beide: het raster en de agendaweek (hoogstens ~6 weken).
  const from = win.days[0] < agendaDays[0] ? win.days[0] : agendaDays[0]
  const to = win.days[win.days.length - 1] > agendaDays[6] ? win.days[win.days.length - 1] : agendaDays[6]

  useEffect(() => {
    send<PoolOptions>('/api/poolwagens/options', 'GET').then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    send<PoolPlanning>(`/api/poolwagens/planning?from=${from}&to=${to}`, 'GET')
      .then(p => { if (alive) { setPlanning(p); setError('') } })
      .catch(e => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [from, to, reload])

  const now = useMemo(() => (planning ? new Date(planning.now) : new Date()), [planning])
  // In de week minstens driekwart dag breed, zodat "10:00–11:00 · Anna" leesbaar is.
  const rows = useMemo(() => (planning
    ? buildPoolGrid(planning, win, userId, now, view !== 'maand', view === 'week' ? (100 / 7) * 0.75 : 0)
    : []), [planning, win, userId, now, view])
  const statusRows = useMemo(() => (planning ? carsNow(planning, userId, now, access.use) : []), [planning, userId, now, access.use])
  const agenda = useMemo(() => (planning ? buildAgenda(planning, agendaDays, today, now, agendaCar || null) : []), [planning, agendaDays, today, now, agendaCar])
  const endangered = useMemo(() => (planning ? endangeredReservations(planning.reservations, now) : new Map()), [planning, now])

  const mine = useMemo(() => (planning?.reservations ?? [])
    .filter(r => isMine(r, userId) && !r.arrived_at && (r.departed_at || Date.parse(r.end_at) > now.getTime()))
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    .slice(0, 6), [planning, userId, now])

  const go = (next: string) => { if (next !== anchor) { setLoading(true); setAnchor(next) } }
  const refresh = () => { setDialog(null); setLoading(true); setReload(r => r + 1) }
  const say = (text: string) => setNotice(newNotice(text))

  const onSelectRange = (carId: string, fromIdx: number, toIdx: number) => {
    const period = selectionToPeriod(win, fromIdx, toIdx, nextHourLocal(), nextHourLocal(new Date(), 2))
    setDialog({ kind: 'form', mode: { kind: 'new', carId, ...period } })
  }

  const firstFree = statusRows.find(r => r.kind === 'vrij')?.car.id ?? statusRows[0]?.car.id ?? ''
  const newReservation = () => setDialog({ kind: 'form', mode: { kind: 'new', carId: firstFree, start: nextHourLocal(), end: nextHourLocal(new Date(), 3) } })
  const departNow = (carId = firstFree) => setDialog({ kind: 'form', mode: { kind: 'now', carId, end: nextHourLocal(new Date(), 3) } })

  const noCars = planning && planning.cars.length === 0
  const open = dialog?.kind === 'detail' ? planning?.reservations.find(r => r.id === dialog.id) ?? null : null
  const isToday = win.days.includes(today)
  const canAct = !!planning && !noCars && access.use

  return (
    <div className="min-h-full pb-28 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-zinc-100">Poolwagens</h1>
          <PoolNav current="planning" manage={access.manage} />
          {loading && <Loader2 size={14} className="animate-spin text-zinc-600" />}
        </div>
        {canAct && (
          <div className="hidden md:flex items-center gap-2">
            <button onClick={() => setDialog({ kind: 'damage', carId: firstFree, reservationId: null })} className={secondaryCls}>
              <Flag size={13} /> Schade melden
            </button>
            <button onClick={() => departNow()} className={secondaryCls}><Car size={13} /> Nu vertrekken</button>
            <button onClick={newReservation} className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}><Plus size={13} /> Reserveren</button>
          </div>
        )}
      </div>

      {(error || notice) && (
        <div className="px-4 sm:px-6 pt-3 space-y-2">
          <ErrorLine>{error}</ErrorLine>
          <Notice notice={notice} onClose={() => setNotice(null)} />
        </div>
      )}

      {!planning ? (
        <div className="p-8">{!error && <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
      ) : noCars ? (
        <div className="flex items-center justify-center p-6 min-h-[50dvh]">
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
        <div className="px-3 sm:px-6 pt-3 space-y-3">
          {mine.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Mijn ritten</span>
              {mine.map(r => {
                const state = tripState(r, now)
                const car = planning.cars.find(c => c.id === r.car_id)
                return (
                  <button key={r.id} onClick={() => setDialog({ kind: 'detail', id: r.id })}
                    className="inline-flex items-center gap-2 min-h-11 md:min-h-0 px-2.5 py-1 rounded-lg border text-xs hover:bg-zinc-800/60 max-w-full"
                    style={{ borderColor: `${STATE_COLOR[state]}80`, color: STATE_COLOR[state] }}>
                    <span className="font-semibold truncate min-w-0">{car?.name ?? 'Wagen'}</span>
                    <span className="text-zinc-400 truncate min-w-0">{formatPeriod(r.start_at, r.end_at)}</span>
                    <span className="hidden sm:inline">{state === 'gepland' ? 'Vertrek registreren' : state === 'teruggebracht' ? STATE_LABEL[state] : 'Aankomst registreren'}</span>
                  </button>
                )
              })}
            </div>
          )}

          <StatusList rows={statusRows}
            onDepart={carId => departNow(carId)}
            onArrive={id => setDialog({ kind: 'detail', id, initialForm: 'aankomst' })}
            onDetails={id => setDialog({ kind: 'detail', id })} />

          {access.use && (
            <FreeCarFinder onReserve={(carId, start, end) => setDialog({ kind: 'form', mode: { kind: 'new', carId, start, end } })} />
          )}

          {/* Desktop: het raster. */}
          <section aria-label="Planning" className="hidden md:block rounded-xl border border-zinc-800 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
              <div className="flex p-0.5 rounded-lg bg-zinc-900 border border-zinc-800" role="tablist" aria-label="Weergave">
                {VIEWS.map(v => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                    {VIEW_LABEL[v]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => go(shiftAnchor(view, anchor, -1))} aria-label="Vorige"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft size={16} /></button>
                <button onClick={() => go(today)} disabled={isToday}
                  className="px-2.5 py-1 text-xs text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800 disabled:opacity-40">Vandaag</button>
                <button onClick={() => go(shiftAnchor(view, anchor, 1))} aria-label="Volgende"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronRight size={16} /></button>
                <span className="ml-2 text-sm font-medium text-zinc-200">{win.title}</span>
              </div>
              <Legend />
            </div>
            <div className="overflow-x-auto">
              <PoolwagenGrid view={view} columns={win.columns} rows={rows} canBook={access.use}
                isPast={i => columnIsPast(win, i, now, today)}
                nowPct={view === 'maand' ? null : nowPercent(win, now)}
                onSelectRange={onSelectRange} onOpenReservation={id => setDialog({ kind: 'detail', id })} />
            </div>
          </section>

          {/* Gsm: de agenda. */}
          <div className="md:hidden">
            <AgendaList days={agenda}
              title={`Week van ${shortDayLabel(agendaDays[0]).slice(3)} tot ${shortDayLabel(agendaDays[6]).slice(3)}`}
              cars={planning.cars.filter(c => !c.archived_at)} carId={agendaCar} onCar={setAgendaCar}
              onShift={delta => go(addDays(anchor, 7 * delta))}
              onToday={() => go(today)} showToday={!agendaDays.includes(today)}
              onOpen={id => setDialog({ kind: 'detail', id })} />
          </div>
        </div>
      )}

      {/* Gsm: Reserveren en Nu vertrekken altijd bij de hand. */}
      {canAct && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2">
          <button onClick={() => departNow()} className={`${secondaryCls} flex-1 min-h-11 justify-center text-sm`}><Car size={15} /> Nu vertrekken</button>
          <button onClick={newReservation} className={`${buttonCls} flex-1 min-h-11 justify-center text-sm text-white`} style={{ backgroundColor: ACCENT }}><Plus size={15} /> Reserveren</button>
        </div>
      )}

      {planning && dialog?.kind === 'form' && (
        <ReservationDialog mode={dialog.mode} planning={planning} options={options} userId={userId} manage={access.manage}
          onClose={() => setDialog(null)}
          onSaved={() => { say(dialog.mode.kind === 'now' ? 'Goede rit! Het vertrek is geregistreerd.' : 'Opgeslagen.'); refresh() }} />
      )}
      {planning && open && dialog?.kind === 'detail' && (
        <ReservationDetail
          key={`${open.id}-${dialog.initialForm ?? ''}`}
          reservation={open}
          car={planning.cars.find(c => c.id === open.car_id) ?? null}
          block={statusRows.find(r => r.car.id === open.car_id)?.block ?? null}
          endangered={endangered.has(open.id)}
          userId={userId}
          manage={access.manage}
          now={now}
          initialForm={dialog.initialForm ?? null}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: 'form', mode: { kind: 'edit', reservation: open } })}
          onReportDamage={() => setDialog({ kind: 'damage', carId: open.car_id, reservationId: open.id })}
          onChanged={() => { say('Opgeslagen.'); refresh() }}
        />
      )}
      {planning && dialog?.kind === 'damage' && (
        <DamageDialog cars={planning.cars} carId={dialog.carId} reservationId={dialog.reservationId}
          onClose={() => setDialog(null)} onSaved={msg => { say(msg); refresh() }} />
      )}
    </div>
  )
}

/** Compact: de kleuren van de balken. De statuslijst zegt de toestand al in woorden. */
function Legend() {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
      {(Object.keys(STATE_COLOR) as (keyof typeof STATE_COLOR)[]).map(s => (
        <span key={s} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: STATE_COLOR[s] }} />{STATE_LABEL[s]}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm border border-dashed border-red-500" />In het gedrang</span>
    </div>
  )
}
