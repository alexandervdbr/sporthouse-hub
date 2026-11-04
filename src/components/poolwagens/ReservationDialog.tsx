'use client'

import { useMemo, useState } from 'react'
import { Car, Check, Loader2 } from 'lucide-react'
import { ACCENT, ErrorLine, Modal, inputCls, labelCls, secondaryCls, buttonCls, send } from './ui'
import { blockFor } from '@/lib/poolwagens/status'
import { reservationFormProblem } from '@/lib/poolwagens/reservation-form'
import { brusselsLocalToISO, isoToBrusselsLocal as toLocal } from '@/lib/poolwagens/time'
import type { PoolOptions, PoolPlanning, PoolReservation } from '@/lib/poolwagens/types'

// Reserveren, een reservatie wijzigen, of "Nu vertrekken" (reservatie vanaf
// nu + vertrek in één keer). Een overlap of blokkade wordt hier al getoond
// met wat de planner kent; de database beslist (en weigert ook wat hier niet
// zichtbaar was). Er staat altijd hoogstens één melding: die van de server
// vervangt die van het formulier, en verdwijnt zodra je iets aanpast.

export type ReservationDialogMode =
  | { kind: 'new'; carId: string; start: string; end: string }
  | { kind: 'edit'; reservation: PoolReservation }
  | { kind: 'now'; carId: string; end: string }

export default function ReservationDialog({ mode, planning, options, userId, manage, onClose, onSaved }: {
  mode: ReservationDialogMode
  planning: PoolPlanning
  options: PoolOptions | null
  userId: string
  manage: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.reservation : null
  const [carId, setCarId] = useState(mode.kind === 'edit' ? mode.reservation.car_id : mode.carId)
  const [start, setStart] = useState(mode.kind === 'new' ? mode.start : mode.kind === 'edit' ? toLocal(mode.reservation.start_at) : '')
  const [end, setEnd] = useState(mode.kind === 'edit' ? toLocal(mode.reservation.end_at) : mode.end)
  const [personId, setPersonId] = useState(userId)
  const [clientText, setClientText] = useState(editing?.client_name ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [kmValue, setKmValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Elke aanpassing wist de melding van de server: die ging over de vorige invoer.
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setError('') }

  const started = !!editing?.departed_at
  const cars = planning.cars.filter(c => !c.archived_at)
  const car = cars.find(c => c.id === carId) ?? null
  const now = useMemo(() => new Date(planning.now), [planning.now])

  const problem = reservationFormProblem({
    kind: mode.kind,
    carId,
    startISO: mode.kind === 'now' ? planning.now : brusselsLocalToISO(start),
    endISO: brusselsLocalToISO(end),
    editing,
    block: car && !started ? blockFor(car, planning) : null,
    reservations: planning.reservations,
    now,
    manage,
  })

  // Klant: een bestaande klant als de getypte naam er exact op past (zonder
  // hoofdlettergevoeligheid), anders een vrij getypte naam. Leeg mag.
  const clients = options?.clients ?? []
  const typed = clientText.trim()
  const matched = typed ? clients.find(c => c.name.trim().toLowerCase() === typed.toLowerCase()) ?? null : null
  const client = { client_id: matched?.id ?? null, client_name: matched ? null : typed || null }

  // Voor wie: dezelfde collega's als in de materiaalplanning (zonder
  // freelancers). Jezelf staat er altijd in, ook als de lijst nog laadt.
  const people = useMemo(() => {
    const list = options?.colleagues ?? []
    return list.some(p => p.id === userId) ? list : [{ id: userId, name: 'Mezelf' }, ...list]
  }, [options, userId])
  const user_id = personId === userId ? null : personId

  async function save() {
    setBusy(true)
    setError('')
    try {
      if (mode.kind === 'now') {
        await send('/api/poolwagens/reservations/now', 'POST', { car_id: carId, end, ...client, note, km: kmValue, user_id })
      } else if (editing) {
        await send(`/api/poolwagens/reservations/${editing.id}`, 'PATCH', { car_id: carId, start, end, ...client, note })
      } else {
        await send('/api/poolwagens/reservations', 'POST', { car_id: carId, start, end, ...client, note, user_id })
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const title = mode.kind === 'now' ? 'Nu vertrekken' : editing ? 'Reservatie wijzigen' : 'Poolwagen reserveren'
  const message = error || problem

  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button onClick={onClose} className={secondaryCls}>Annuleren</button>
        <button onClick={save} disabled={busy || !carId || !end || (mode.kind !== 'now' && !start) || !!problem}
          className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : mode.kind === 'now' ? <Car size={14} /> : <Check size={14} />}
          {mode.kind === 'now' ? 'Vertrekken' : editing ? 'Opslaan' : 'Reserveren'}
        </button>
      </>
    }>
      <div>
        <label className={labelCls}>Wagen</label>
        <select className={inputCls} value={carId} onChange={e => edit(setCarId)(e.target.value)} disabled={started}>
          {cars.map(c => (
            <option key={c.id} value={c.id}>{c.name} — {c.license_plate}{blockFor(c, planning) ? ' (niet beschikbaar)' : ''}</option>
          ))}
        </select>
      </div>

      {editing ? (
        editing.user_id !== userId && (
          <p className="text-xs text-zinc-500">Voor <span className="text-zinc-300">{editing.person_name}</span></p>
        )
      ) : (
        <div>
          <label className={labelCls}>Voor wie</label>
          <select className={inputCls} value={personId} onChange={e => edit(setPersonId)(e.target.value)}>
            {people.map(p => <option key={p.id} value={p.id}>{p.id === userId && p.name !== 'Mezelf' ? `${p.name} (ik)` : p.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mode.kind !== 'now' && (
          <div>
            <label className={labelCls}>Vertrek</label>
            <input type="datetime-local" className={inputCls} value={start} onChange={e => edit(setStart)(e.target.value)} />
          </div>
        )}
        <div className={mode.kind === 'now' ? 'sm:col-span-2' : ''}>
          <label className={labelCls}>Verwachte terugkomst</label>
          <input type="datetime-local" className={inputCls} value={end} onChange={e => edit(setEnd)(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Klant (optioneel)</label>
        <input className={inputCls} list="poolwagens-klanten" value={clientText} onChange={e => edit(setClientText)(e.target.value)}
          placeholder="Kies een klant of typ een naam" maxLength={200} autoComplete="off" />
        <datalist id="poolwagens-klanten">
          {clients.map(c => <option key={c.id} value={c.name} />)}
        </datalist>
        {typed && (
          <p className="mt-1 text-[11px] text-zinc-500">
            {matched ? 'Gekoppeld aan deze klant in de hub.' : 'Staat niet in de klantenlijst: wordt bewaard zoals getypt.'}
          </p>
        )}
      </div>

      {mode.kind === 'now' && (
        <div>
          <label className={labelCls}>Kilometerstand bij vertrek</label>
          <input className={inputCls} inputMode="numeric" value={kmValue} onChange={e => edit(setKmValue)(e.target.value)}
            placeholder={car ? `${car.current_km} (laatst bekend)` : ''} />
        </div>
      )}

      <div>
        <label className={labelCls}>Notitie (optioneel)</label>
        <input className={inputCls} value={note} onChange={e => edit(setNote)(e.target.value)} placeholder="bv. ophalen materiaal in Gent" />
      </div>

      <ErrorLine>{message}</ErrorLine>
    </Modal>
  )
}
