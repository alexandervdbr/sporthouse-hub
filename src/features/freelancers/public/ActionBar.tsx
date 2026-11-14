'use client'

import { useState } from 'react'
import { Button } from '@/components/materiaal/ui'
import type { Detail } from './api'
import { longDate } from './format'

// De vaste actiebalk onderaan, afhankelijk van de status:
//   gedeeld      → Accepteren (primair) + Weigeren (vraagt een optionele reden)
//   geaccepteerd → Markeer als opgeleverd (met bevestiging)
//   opgeleverd   → "Opgeleverd op …, we bekijken het"
//   afgerond / geweigerd → alleen lezen

const BIG = '!h-12 !text-base flex-1'

export default function ActionBar({ a, busy, onAction }: {
  a: Detail
  busy: boolean
  onAction: (action: 'accepteren' | 'weigeren' | 'opleveren', reason?: string) => void
}) {
  const [mode, setMode] = useState<'idle' | 'weigeren' | 'opleveren'>('idle')
  const [reason, setReason] = useState('')

  if (a.status === 'gedeeld' && mode === 'weigeren') {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="text-sm text-zinc-400">Waarom niet? (optioneel)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={2000}
            className="mt-1 block w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-base text-white
              focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-[#3A913F]/40" />
        </label>
        <div className="flex gap-2">
          <Button className={BIG} onClick={() => setMode('idle')} disabled={busy}>Terug</Button>
          <Button variant="destructive" className={BIG} busy={busy} onClick={() => onAction('weigeren', reason.trim())}>Opdracht weigeren</Button>
        </div>
      </div>
    )
  }

  if (a.status === 'gedeeld') {
    return (
      <div className="flex gap-2">
        <Button className={BIG} onClick={() => setMode('weigeren')} disabled={busy}>Weigeren</Button>
        <Button variant="primary" className={BIG} busy={busy} onClick={() => onAction('accepteren')}>Accepteren</Button>
      </div>
    )
  }

  if (a.status === 'geaccepteerd') {
    if (mode === 'opleveren') {
      return (
        <div className="space-y-2">
          <p className="text-base text-zinc-300">
            {a.files.some(f => f.fromYou) ? 'Alles opgeleverd? Je kan daarna nog bestanden toevoegen.' : 'Je voegde nog geen bestanden toe. Toch als opgeleverd markeren?'}
          </p>
          <div className="flex gap-2">
            <Button className={BIG} onClick={() => setMode('idle')} disabled={busy}>Nee, terug</Button>
            <Button variant="primary" className={BIG} busy={busy} onClick={() => onAction('opleveren')}>Ja, opgeleverd</Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex">
        <Button variant="primary" className={BIG} onClick={() => setMode('opleveren')} disabled={busy}>Markeer als opgeleverd</Button>
      </div>
    )
  }

  if (a.status === 'opgeleverd') {
    return (
      <p className="py-2 text-center text-base text-zinc-300">
        Opgeleverd{a.statusChangedAt ? ` op ${longDate(a.statusChangedAt)}` : ''}, we bekijken het.
      </p>
    )
  }

  return null
}
