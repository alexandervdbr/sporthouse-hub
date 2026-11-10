'use client'

import { useState } from 'react'
import { Check, Wrench } from 'lucide-react'
import { Button, inputCls } from '@/components/materiaal/ui'
import type { UnitStatus } from '@/lib/gear/status'

// De knoppen om de toestand van een item te zetten, in het zijpaneel en op de
// itempagina. Eerst kies je wat er aan de hand is, dan pas schrijf je waarom:
// bij Defect of Beperkt klapt er een veld open. Bij Beperkt is die uitleg
// verplicht (wie boekt, moet weten wat er beperkt is), bij Defect optioneel
// (het is toch niet te boeken). Hersteld en Uit dienst zijn één klik, en
// alleen voor wie de catalogus beheert.

type Reportable = 'defect' | 'beperkt'

const COPY: Record<Reportable, { button: string; confirm: string; placeholder: string }> = {
  defect:  { button: 'Defect',  confirm: 'Defect melden',  placeholder: 'Wat is er mis? (optioneel) bv. lens krast' },
  beperkt: { button: 'Beperkt', confirm: 'Beperkt melden', placeholder: 'Wat is er beperkt? bv. kapotte vijs' },
}

export default function StatusPicker({ status, canManage, onSet }: {
  status: UnitStatus
  canManage: boolean
  /** Geeft true terug als het gelukt is; dan klapt het veld weer dicht. */
  onSet: (status: UnitStatus, note: string) => Promise<boolean>
}) {
  const [pending, setPending] = useState<Reportable | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<UnitStatus | null>(null)

  const canConfirm = pending !== null && (pending === 'defect' || note.trim() !== '')

  async function apply(s: UnitStatus, n: string) {
    setBusy(s)
    const ok = await onSet(s, n)
    setBusy(null)
    if (ok) { setPending(null); setNote('') }
  }

  function cancel() { setPending(null); setNote('') }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(['defect', 'beperkt'] as const).filter(s => s !== status).map(s => (
          <Button key={s} size="sm" aria-pressed={pending === s} onClick={() => setPending(p => (p === s ? null : s))}
            className={pending === s ? '!border-zinc-400 !bg-zinc-700 !text-white' : ''}>
            {s === 'defect' && <Wrench size={12} />} {COPY[s].button}
          </Button>
        ))}
        {canManage && status !== 'ok' && (
          <Button size="sm" busy={busy === 'ok'} onClick={() => apply('ok', '')}><Check size={12} /> Hersteld</Button>
        )}
        {canManage && status !== 'uit_dienst' && (
          <Button size="sm" busy={busy === 'uit_dienst'} onClick={() => apply('uit_dienst', '')}>Uit dienst</Button>
        )}
      </div>

      {pending && (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (canConfirm) apply(pending, note) }}>
          <input autoFocus value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}
            placeholder={COPY[pending].placeholder} aria-label={`Notitie bij ${COPY[pending].button.toLowerCase()}`} className={inputCls} />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" variant="primary" disabled={!canConfirm} busy={busy === pending}>{COPY[pending].confirm}</Button>
            <Button type="button" size="sm" variant="text" onClick={cancel}>Annuleer</Button>
          </div>
        </form>
      )}
    </div>
  )
}
