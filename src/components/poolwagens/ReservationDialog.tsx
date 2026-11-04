'use client'

import { useMemo, useState } from 'react'
import { Car, Check, Loader2 } from 'lucide-react'
import { ACCENT, ErrorLine, Modal, inputCls, labelCls, secondaryCls, buttonCls, send } from './ui'
import { carBlock } from '@/lib/poolwagens/blocking'
import { periodsOverlap, brusselsLocalToISO, formatPeriod, isoToBrusselsLocal as toLocal } from '@/lib/poolwagens/time'
import type { PoolCar, PoolOptions, PoolPlanning, PoolReservation } from '@/lib/poolwagens/types'

// Reserveren, een reservatie wijzigen, of "Nu vertrekken" (reservatie vanaf
// nu + vertrek in één keer). Een overlap of blokkade wordt hier al getoond
// met wat de planner kent; de database beslist (en weigert ook wat hier niet
// zichtbaar was, bv. een reservatie in een andere maand).

export type ReservationDialogMode =
  | { kind: 'new'; carId: string; start: string; end: string }
  | { kind: 'edit'; reservation: PoolReservation }
  | { kind: 'now'; carId: string; end: string }

export default function ReservationDialog({ mode, planning, options, onClose, onSaved }: {
  mode: ReservationDialogMode
  planning: PoolPlanning
  options: PoolOptions | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.reservation : null
  const [carId, setCarId] = useState(mode.kind === 'edit' ? mode.reservation.car_id : mode.carId)
  const [start, setStart] = useState(mode.kind === 'new' ? mode.start : mode.kind === 'edit' ? toLocal(mode.reservation.start_at) : '')
  const [end, setEnd] = useState(mode.kind === 'edit' ? toLocal(mode.reservation.end_at) : mode.end)
  const [projectId, setProjectId] = useState(editing?.project?.id ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [kmValue, setKmValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const started = !!editing?.departed_at
  const cars = planning.cars.filter(c => !c.archived_at)
  const car = cars.find(c => c.id === carId) ?? null
  const blockingCars = useMemo(() => new Set(planning.blockingDamage.map(d => d.car_id)), [planning])
  const blockOf = (c: PoolCar) => carBlock(c, blockingCars.has(c.id) ? [{ severity: 'ernstig', status: 'gemeld', block_lifted_at: null }] : [])

  // Wat de planner al kent: botst de gekozen periode?
  const startISO = mode.kind === 'now' ? planning.now : brusselsLocalToISO(start)
  const endISO = brusselsLocalToISO(end)
  const clash = startISO && endISO && carId
    ? planning.reservations.find(r => r.car_id === carId && r.id !== editing?.id
        && periodsOverlap({ start: startISO, end: endISO }, { start: r.start_at, end: r.end_at }))
    : undefined
  const block = car && !started ? blockOf(car) : null
  // Een bestaande reservatie op een geblokkeerde wagen verkorten mag.
  const blockStops = block && (!editing || carId !== editing.car_id
    || (startISO && endISO && (Date.parse(startISO) < Date.parse(editing.start_at) || Date.parse(endISO) > Date.parse(editing.end_at))))

  const projects = options?.projects ?? []
  const projectMissing = editing?.project && !projects.some(p => p.id === editing.project!.id)

  async function save() {
    setBusy(true)
    setError('')
    try {
      if (mode.kind === 'now') {
        await send('/api/poolwagens/reservations/now', 'POST', { car_id: carId, end, project_id: projectId, note, km: kmValue })
      } else if (editing) {
        await send(`/api/poolwagens/reservations/${editing.id}`, 'PATCH', { car_id: carId, start, end, project_id: projectId, note })
      } else {
        await send('/api/poolwagens/reservations', 'POST', { car_id: carId, start, end, project_id: projectId, note })
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const title = mode.kind === 'now' ? 'Nu vertrekken' : editing ? 'Reservatie wijzigen' : 'Poolwagen reserveren'

  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button onClick={onClose} className={secondaryCls}>Annuleren</button>
        <button onClick={save} disabled={busy || !carId || !projectId || !end || (mode.kind !== 'now' && !start) || !!blockStops}
          className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : mode.kind === 'now' ? <Car size={14} /> : <Check size={14} />}
          {mode.kind === 'now' ? 'Vertrekken' : editing ? 'Opslaan' : 'Reserveren'}
        </button>
      </>
    }>
      <div>
        <label className={labelCls}>Wagen</label>
        <select className={inputCls} value={carId} onChange={e => setCarId(e.target.value)} disabled={started}>
          {cars.map(c => {
            const b = blockOf(c)
            return <option key={c.id} value={c.id}>{c.name} — {c.license_plate}{b ? ' (niet beschikbaar)' : ''}</option>
          })}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mode.kind !== 'now' && (
          <div>
            <label className={labelCls}>Vertrek</label>
            <input type="datetime-local" className={inputCls} value={start} onChange={e => setStart(e.target.value)} />
          </div>
        )}
        <div className={mode.kind === 'now' ? 'sm:col-span-2' : ''}>
          <label className={labelCls}>Verwachte terugkomst</label>
          <input type="datetime-local" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Project</label>
        <select className={inputCls} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Kies een project…</option>
          {projectMissing && <option value={editing!.project!.id}>{editing!.project!.name}</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {mode.kind === 'now' && (
        <div>
          <label className={labelCls}>Kilometerstand bij vertrek</label>
          <input className={inputCls} inputMode="numeric" value={kmValue} onChange={e => setKmValue(e.target.value)}
            placeholder={car ? `${car.current_km} (laatst bekend)` : ''} />
        </div>
      )}

      <div>
        <label className={labelCls}>Notitie (optioneel)</label>
        <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="bv. ophalen materiaal in Gent" />
      </div>

      {blockStops && block && <ErrorLine>{block.reason} en kan niet gereserveerd worden.</ErrorLine>}
      {!blockStops && clash && (
        <ErrorLine>Deze wagen is dan al gereserveerd: {formatPeriod(clash.start_at, clash.end_at)}, {clash.person_name}.</ErrorLine>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
