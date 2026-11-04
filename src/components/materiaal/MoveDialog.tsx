'use client'

import { useState } from 'react'
import { PrimaryButton } from '@/components/materiaal/ui'

// Wat een verhuis met komende boekingen doet, vóór je bevestigt. Eén venster,
// ook als je meerdere items tegelijk verplaatst. Standaard gaan de boekingen
// mee; wat niet kan, staat er met de reden bij. De verhuis zelf gaat altijd door.

export interface PreviewStep { booking_id: string; start_date: string; end_date: string; ok: boolean; reason?: string; label: string }
export interface MovePreview { from_kit_id: string | null; remove: PreviewStep[]; add: PreviewStep[] }
export interface MovePreviewEntry { itemName: string; fromName: string | null; toName: string | null; preview: MovePreview }

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

export default function MoveDialog({ title, entries, onCancel, onConfirm }: {
  title: string
  entries: MovePreviewEntry[]
  onCancel: () => void
  onConfirm: (updateBookings: boolean) => void
}) {
  const [update, setUpdate] = useState(true)
  const Step = ({ s, verb }: { s: PreviewStep; verb: string }) => (
    <li className="text-xs">
      <span className="text-zinc-300">{s.label}</span>{' '}
      <span className="text-zinc-500">{fmt(s.start_date)}{s.end_date !== s.start_date ? ` – ${fmt(s.end_date)}` : ''}</span>{' '}
      {s.ok ? <span className="text-emerald-400">{verb}</span> : <span className="text-amber-300">blijft zo: {s.reason}</span>}
    </li>
  )
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="move-title" className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 id="move-title" className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Dit raakt komende boekingen.</p>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {entries.map((e, i) => (
            <div key={i} className="space-y-2">
              {entries.length > 1 && <p className="text-xs font-medium text-zinc-200">{e.itemName}</p>}
              {e.preview.remove.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Komende boekingen van {e.fromName}:</p>
                  <ul className="space-y-1">{e.preview.remove.map(s => <Step key={s.booking_id} s={s} verb="— gaat eruit" />)}</ul>
                </div>
              )}
              {e.preview.add.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Komende boekingen van {e.toName}:</p>
                  <ul className="space-y-1">{e.preview.add.map(s => <Step key={s.booking_id} s={s} verb="— komt erbij" />)}</ul>
                </div>
              )}
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={update} onChange={ev => setUpdate(ev.target.checked)} className="accent-[#3A913F]" />
            Deze boekingen ook bijwerken
          </label>
          {!update && <p className="text-xs text-zinc-500">De boekingen blijven dan zoals ze zijn.</p>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">Annuleren</button>
          <PrimaryButton onClick={() => onConfirm(update)}>Verplaatsen</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
