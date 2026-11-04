'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Flag, Loader2, LogIn, LogOut, Pencil, Trash2 } from 'lucide-react'
import { ACCENT, ErrorLine, Modal, buttonCls, dangerCls, inputCls, km, labelCls, secondaryCls, send } from './ui'
import { STATE_LABEL } from './PoolwagenGrid'
import { arrivalKmError } from '@/lib/poolwagens/km'
import { parseKm } from '@/lib/poolwagens/car-input'
import { formatPeriod, formatShort, isoToBrusselsLocal } from '@/lib/poolwagens/time'
import { canChangeReservation, canRegisterTrip, tripState } from '@/lib/poolwagens/trips'
import type { CarBlock } from '@/lib/poolwagens/blocking'
import type { PoolCar, PoolReservation } from '@/lib/poolwagens/types'

// Eén reservatie of rit: details, en wat je ermee kan doen — wijzigen,
// annuleren, vertrek of aankomst registreren, schade melden.

export default function ReservationDetail({ reservation: r, car, block, endangered, userId, manage, now, onClose, onEdit, onReportDamage, onChanged }: {
  reservation: PoolReservation
  car: PoolCar | null
  block: CarBlock | null
  endangered: boolean
  userId: string
  manage: boolean
  now: Date
  onClose: () => void
  onEdit: () => void
  onReportDamage: () => void
  onChanged: () => void
}) {
  const state = tripState(r, now)
  const canChange = canChangeReservation(r, userId, manage)
  const canTrip = canRegisterTrip(r, userId, manage)
  const [form, setForm] = useState<'vertrek' | 'aankomst' | null>(null)
  const [at, setAt] = useState('')
  const [kmValue, setKmValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  function openForm(kind: 'vertrek' | 'aankomst') {
    setForm(kind)
    setAt(isoToBrusselsLocal(new Date()))
    setKmValue(kind === 'vertrek' && car ? String(car.current_km) : '')
    setError('')
  }

  const arrivalProblem = form === 'aankomst' && r.departure_km !== null && kmValue !== ''
    ? arrivalKmError(r.departure_km, parseKm(kmValue))
    : null

  return (
    <Modal title={car ? `${car.name} — ${car.license_plate}` : 'Reservatie'} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-zinc-500">Wie</dt><dd className="text-zinc-200">{r.person_name}</dd>
        <dt className="text-zinc-500">Project</dt><dd className="text-zinc-200">{r.project?.name ?? '—'}</dd>
        <dt className="text-zinc-500">Gepland</dt><dd className="text-zinc-200">{formatPeriod(r.start_at, r.end_at)}</dd>
        <dt className="text-zinc-500">Status</dt><dd className="text-zinc-200">{STATE_LABEL[state]}</dd>
        {r.departed_at && (<><dt className="text-zinc-500">Vertrek</dt><dd className="text-zinc-200">{formatShort(r.departed_at)} · {km(r.departure_km)}</dd></>)}
        {r.arrived_at && (<><dt className="text-zinc-500">Aankomst</dt><dd className="text-zinc-200">{formatShort(r.arrived_at)} · {km(r.arrival_km)}</dd></>)}
        {r.driven_km !== null && (<><dt className="text-zinc-500">Gereden</dt><dd className="text-zinc-200">{km(r.driven_km)}</dd></>)}
        {r.note && (<><dt className="text-zinc-500">Notitie</dt><dd className="text-zinc-200">{r.note}</dd></>)}
      </dl>

      {state === 'te_laat' && (
        <Warning>De geplande terugkomst is voorbij en de aankomst is nog niet geregistreerd.</Warning>
      )}
      {endangered && (
        <Warning>In het gedrang: de vorige rit met deze wagen is nog niet terug.</Warning>
      )}
      {block && state !== 'teruggebracht' && (
        <Warning>{block.reason}. Deze reservatie blijft staan, maar overleg met de vlootbeheerder.</Warning>
      )}

      {form && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{form === 'vertrek' ? 'Vertrokken om' : 'Aangekomen om'}</label>
              <input type="datetime-local" className={inputCls} value={at} onChange={e => setAt(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Kilometerstand bij {form}</label>
              <input className={inputCls} inputMode="numeric" value={kmValue} onChange={e => setKmValue(e.target.value)} autoFocus
                placeholder={form === 'aankomst' && r.departure_km !== null ? `minstens ${r.departure_km}` : ''} />
            </div>
          </div>
          {arrivalProblem && <ErrorLine>{arrivalProblem}</ErrorLine>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className={secondaryCls}>Annuleren</button>
            <button
              disabled={busy || (form === 'aankomst' && (!kmValue || !!arrivalProblem))}
              onClick={() => run(() => send(`/api/poolwagens/reservations/${r.id}/${form === 'vertrek' ? 'departure' : 'arrival'}`, 'POST', { at, km: kmValue }))}
              className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
              {busy && <Loader2 size={14} className="animate-spin" />} {form === 'vertrek' ? 'Vertrek registreren' : 'Aankomst registreren'}
            </button>
          </div>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>

      {!form && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canTrip && !r.departed_at && (
            <button onClick={() => openForm('vertrek')} className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
              <LogOut size={14} /> Vertrek registreren
            </button>
          )}
          {canTrip && r.departed_at && !r.arrived_at && (
            <button onClick={() => openForm('aankomst')} className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
              <LogIn size={14} /> Aankomst registreren
            </button>
          )}
          {canChange && (!r.departed_at || manage) && (
            <button onClick={onEdit} className={secondaryCls}><Pencil size={14} /> Wijzigen</button>
          )}
          {canChange && !r.departed_at && (
            <button disabled={busy}
              onClick={() => { if (confirm('Deze reservatie annuleren?')) run(() => send(`/api/poolwagens/reservations/${r.id}`, 'DELETE')) }}
              className={dangerCls}>
              <Trash2 size={14} /> Annuleren
            </button>
          )}
          {r.departed_at && (
            <button onClick={onReportDamage} className={secondaryCls}><Flag size={14} /> Schade melden</button>
          )}
        </div>
      )}
    </Modal>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-300">
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}
