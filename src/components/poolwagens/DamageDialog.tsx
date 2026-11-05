'use client'

import { useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { ErrorLine, Modal, buttonCls, inputCls, labelCls, secondaryCls } from './ui'
import { DamageFields, EMPTY_DAMAGE, damageReady, submitDamage, type DamageDraft } from './damage-form'
import type { PoolCar } from '@/lib/poolwagens/types'

// Schade melden: wagen, omschrijving, ernst, foto's. Het opslaan zelf (en
// wat er gebeurt als een foto of de mail mislukt) staat in damage-form.tsx.

export default function DamageDialog({ cars, carId, reservationId, onClose, onSaved }: {
  cars: PoolCar[]
  carId: string
  reservationId: string | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [car, setCar] = useState(carId)
  const [draft, setDraft] = useState<DamageDraft>(EMPTY_DAMAGE)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    const result = await submitDamage({ carId: car, reservationId, draft, onProgress: setProgress })
    if (result.ok) onSaved(result.message)
    else { setError(result.error); setBusy(false) }
  }

  return (
    <Modal title="Schade melden" onClose={busy ? () => {} : onClose} footer={
      <>
        {progress && <span className="mr-auto text-xs text-zinc-500">{progress}</span>}
        <button onClick={onClose} disabled={busy} className={secondaryCls}>Annuleren</button>
        <button onClick={submit} disabled={busy || !car || !damageReady(draft)} className={`${buttonCls} text-white bg-red-600 hover:bg-red-500`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Melden
        </button>
      </>
    }>
      <div>
        <label className={labelCls}>Wagen</label>
        <select className={inputCls} value={car} onChange={e => setCar(e.target.value)} disabled={!!reservationId || busy}>
          {cars.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{c.name} — {c.license_plate}</option>)}
        </select>
        {reservationId && <p className="mt-1 text-xs text-zinc-500">Gekoppeld aan deze rit.</p>}
      </div>

      <DamageFields draft={draft} onChange={setDraft} onError={setError} disabled={busy} />

      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
