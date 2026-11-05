'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, Flag, Loader2, LogIn, LogOut, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { ACCENT, ErrorLine, Modal, buttonCls, dangerCls, inputCls, km, labelCls, secondaryCls, send } from './ui'
import { STATE_LABEL } from './PoolwagenGrid'
import { DamageFields, EMPTY_DAMAGE, damageReady, submitDamage, type DamageDraft } from './damage-form'
import { runArrival } from '@/lib/poolwagens/arrival-flow'
import { arrivalKmError } from '@/lib/poolwagens/km'
import { parseKm } from '@/lib/poolwagens/car-input'
import { formatPeriod, formatShort, nowLocal, tripTimeError } from '@/lib/poolwagens/time'
import { canChangeReservation, canRegisterTrip, tripState } from '@/lib/poolwagens/trips'
import type { CarBlock } from '@/lib/poolwagens/blocking'
import type { PoolCar, PoolReservation } from '@/lib/poolwagens/types'

// Eén reservatie of rit: details, en wat je ermee kan doen — wijzigen,
// annuleren, vertrek of aankomst registreren, schade melden. De knoppen staan
// onderaan in het venster, zodat ze ook op een gsm altijd zichtbaar zijn.
//
// Vertrek en aankomst: het tijdstip staat op "nu" (Brusselse kloktijd). Pas
// je het niet aan, dan gaat er geen tijdstip mee en neemt de database zijn
// eigen "nu" — dan kan een klok die afwijkt niets mislopen. Pas je het wel
// aan, dan controleert het formulier meteen of het niet in de toekomst ligt
// (en een aankomst niet vóór het vertrek), net als de kilometerstand.
//
// Bij de aankomst kan je meteen schade melden ("Schade opgemerkt?"). Eerst
// wordt de aankomst opgeslagen, daarna de schade; mislukt die, dan blijft de
// aankomst staan en kan je de schade opnieuw proberen zonder iets te verliezen.

type TripForm = 'vertrek' | 'aankomst'

export default function ReservationDetail({ reservation: r, car, block, endangered, userId, manage, now, initialForm = null, onClose, onEdit, onReportDamage, onChanged }: {
  reservation: PoolReservation
  car: PoolCar | null
  block: CarBlock | null
  endangered: boolean
  userId: string
  manage: boolean
  now: Date
  /** Meteen het formulier voor vertrek of aankomst openen (snelle actie in de statuslijst). */
  initialForm?: TripForm | null
  onClose: () => void
  onEdit: () => void
  onReportDamage: () => void
  /** Na een geslaagde wijziging; met een eigen melding als die er is. */
  onChanged: (message?: string) => void
}) {
  const state = tripState(r, now)
  const canChange = canChangeReservation(r, userId, manage)
  const canTrip = canRegisterTrip(r, userId, manage)
  const startForm = initialForm === 'vertrek' ? (canTrip && !r.departed_at ? 'vertrek' : null)
    : initialForm === 'aankomst' ? (canTrip && r.departed_at && !r.arrived_at ? 'aankomst' : null) : null
  const [form, setForm] = useState<TripForm | null>(startForm)
  const [at, setAt] = useState(() => nowLocal())
  const [atTouched, setAtTouched] = useState(false)
  const [kmValue, setKmValue] = useState(startForm === 'vertrek' && car ? String(car.current_km) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [damageOpen, setDamageOpen] = useState(false)
  const [damage, setDamage] = useState<DamageDraft>(EMPTY_DAMAGE)
  const [damageError, setDamageError] = useState('')
  const [progress, setProgress] = useState('')
  // De aankomst staat al in de database, alleen de schade nog niet.
  const [arrivalDone, setArrivalDone] = useState(false)

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

  function openForm(kind: TripForm) {
    setForm(kind)
    setAt(nowLocal())
    setAtTouched(false)
    setKmValue(kind === 'vertrek' && car ? String(car.current_km) : '')
    setError('')
  }

  const kmProblem = form === 'aankomst' && r.departure_km !== null && kmValue !== ''
    ? arrivalKmError(r.departure_km, parseKm(kmValue))
    : null
  // Alleen een zelf gekozen tijdstip kan fout zijn; "nu" is altijd goed.
  const timeProblem = form && atTouched ? tripTimeError(form, at, { now: new Date(), departedAt: r.departed_at }) : null
  const withDamage = form === 'aankomst' && damageOpen
  const blocked = busy || (!arrivalDone && (!!timeProblem || (form === 'aankomst' && (!kmValue || !!kmProblem))))
    || (withDamage && !damageReady(damage))

  const tripCall = () => send(
    `/api/poolwagens/reservations/${r.id}/${form === 'vertrek' ? 'departure' : 'arrival'}`, 'POST',
    { at: atTouched ? at : null, km: kmValue },
  )

  async function submit() {
    if (form !== 'aankomst') { run(tripCall); return }
    setBusy(true)
    setError('')
    setDamageError('')
    const outcome = await runArrival({
      arrivalDone,
      saveArrival: tripCall,
      saveDamage: withDamage ? () => submitDamage({ carId: r.car_id, reservationId: r.id, draft: damage, onProgress: setProgress }) : null,
    })
    setProgress('')
    if (outcome.stage === 'klaar') { onChanged(outcome.damageMessage ? `Aankomst geregistreerd. ${outcome.damageMessage}` : undefined); return }
    setBusy(false)
    if (outcome.stage === 'aankomst-mislukt') setError(outcome.error)
    else { setArrivalDone(true); setDamageError(outcome.error) }
  }

  // Sluiten nadat de aankomst al opgeslagen is: de planning moet die tonen.
  const close = () => (arrivalDone ? onChanged('Aankomst geregistreerd; de schade is niet gemeld.') : onClose())

  const footer = form ? (
    <>
      {progress && <span className="mr-auto text-xs text-zinc-500">{progress}</span>}
      {!arrivalDone && <button onClick={() => { setForm(null); setError('') }} disabled={busy} className={secondaryCls}>Annuleren</button>}
      <button disabled={blocked} onClick={submit} className={`${buttonCls} text-white`} style={{ backgroundColor: ACCENT }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : form === 'vertrek' ? <LogOut size={14} /> : <LogIn size={14} />}
        {form === 'vertrek' ? 'Vertrek registreren' : arrivalDone ? 'Schade melden' : withDamage ? 'Aankomst en schade registreren' : 'Aankomst registreren'}
      </button>
    </>
  ) : (
    <>
      {r.departed_at && (
        <button onClick={onReportDamage} className={secondaryCls}><Flag size={14} /> Schade melden</button>
      )}
      {canChange && !r.departed_at && (
        <button disabled={busy}
          onClick={() => { if (confirm('Deze reservatie annuleren?')) run(() => send(`/api/poolwagens/reservations/${r.id}`, 'DELETE')) }}
          className={dangerCls}>
          <Trash2 size={14} /> Annuleren
        </button>
      )}
      {canChange && (!r.departed_at || manage) && (
        <button onClick={onEdit} className={secondaryCls}><Pencil size={14} /> Wijzigen</button>
      )}
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
    </>
  )

  const byOther = r.created_by && r.created_by !== r.user_id && r.created_by_name

  return (
    <Modal title={car ? `${car.name} — ${car.license_plate}` : 'Reservatie'} onClose={busy ? () => {} : close} footer={footer}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-zinc-500">Wie</dt><dd className="text-zinc-200">{r.person_name}</dd>
        {byOther && (<><dt className="text-zinc-500">Gereserveerd door</dt><dd className="text-zinc-200">{r.created_by_name}</dd></>)}
        {r.client_name && (<><dt className="text-zinc-500">Klant</dt><dd className="text-zinc-200">{r.client_name}</dd></>)}
        <dt className="text-zinc-500">Gepland</dt><dd className="text-zinc-200">{formatPeriod(r.start_at, r.end_at)}</dd>
        <dt className="text-zinc-500">Status</dt><dd className="text-zinc-200">{STATE_LABEL[state]}</dd>
        {r.departed_at && (<><dt className="text-zinc-500">Vertrek</dt><dd className="text-zinc-200">{formatShort(r.departed_at)} · {km(r.departure_km)}</dd></>)}
        {r.arrived_at && (<><dt className="text-zinc-500">Aankomst</dt><dd className="text-zinc-200">{formatShort(r.arrived_at)} · {km(r.arrival_km)}</dd></>)}
        {r.driven_km !== null && (<><dt className="text-zinc-500">Gereden</dt><dd className="text-zinc-200">{km(r.driven_km)}</dd></>)}
        {r.note && (<><dt className="text-zinc-500">Notitie</dt><dd className="text-zinc-200 break-words">{r.note}</dd></>)}
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
              <input type="datetime-local" className={inputCls} value={at} aria-invalid={!!timeProblem} disabled={arrivalDone}
                onChange={e => { setAt(e.target.value); setAtTouched(true); setError('') }} />
              {!atTouched && <p className="mt-1 text-[11px] text-zinc-500">Nu</p>}
            </div>
            <div>
              <label className={labelCls}>Kilometerstand bij {form}</label>
              <input className={inputCls} inputMode="numeric" value={kmValue} onChange={e => { setKmValue(e.target.value); setError('') }} autoFocus disabled={arrivalDone}
                placeholder={form === 'aankomst' && r.departure_km !== null ? `minstens ${r.departure_km}` : ''} />
            </div>
          </div>
          {!arrivalDone && timeProblem && <ErrorLine>{timeProblem}</ErrorLine>}
          {!arrivalDone && kmProblem && <ErrorLine>{kmProblem}</ErrorLine>}

          {form === 'aankomst' && (
            <div className="border-t border-zinc-800 pt-3 space-y-3">
              <button type="button" onClick={() => setDamageOpen(o => !o)} disabled={busy || arrivalDone} aria-expanded={damageOpen}
                className="w-full min-h-11 md:min-h-0 flex items-center justify-between gap-2 text-sm text-zinc-300 hover:text-zinc-100">
                <span className="inline-flex items-center gap-2"><Flag size={14} className="text-red-400" /> Schade opgemerkt?</span>
                <ChevronDown size={15} className={`transition-transform ${damageOpen ? 'rotate-180' : ''}`} />
              </button>
              {damageOpen && (
                <>
                  <p className="text-xs text-zinc-500">Wordt gemeld voor {car?.name ?? 'deze wagen'}, bij deze rit.</p>
                  <DamageFields draft={damage} onChange={d => { setDamage(d); setDamageError('') }} onError={setDamageError} disabled={busy} />
                </>
              )}
            </div>
          )}

          {arrivalDone && damageError && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-300">
              <span className="flex-1">De aankomst is geregistreerd, maar de schademelding lukte niet: {damageError}</span>
              <button onClick={submit} disabled={busy} className={`${secondaryCls} ${'min-h-11 md:min-h-0 justify-center'}`}>
                <RotateCcw size={13} /> Opnieuw proberen
              </button>
            </div>
          )}
          {!arrivalDone && damageError && <ErrorLine>{damageError}</ErrorLine>}
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>
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
