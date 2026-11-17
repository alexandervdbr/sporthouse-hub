'use client'

import { send } from '@/components/materiaal/ui'
import type { KeepOption } from '@/lib/gear/merge'
import type { UndoEntry } from '@/lib/gear/undo'

// Gedeeld door "Samenvoegen" (Mijn boekingen) en "Toevoegen aan die boeking?"
// (nieuw boeken): kiezen welke klant en welk project blijven, en het
// ongedaan maken van een samenvoeging.

/** Welke klant/project blijven, als ze verschillen. Eén optie: niets te kiezen, niets getoond. */
export function KeepChoice({ options, value, onChange, note }: {
  options: KeepOption[]
  value: string
  onChange: (bookingId: string) => void
  /** De samengevoegde notitie, om te tonen. */
  note: string | null
}) {
  return (
    <div className="space-y-2">
      {options.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-zinc-400 mb-1">Klant en project verschillen. Welke houden?</legend>
          {options.map(o => (
            <label key={o.bookingId} className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer min-h-9 sm:min-h-0">
              <input type="radio" name="keep" checked={value === o.bookingId} onChange={() => onChange(o.bookingId)} className="accent-emerald-500" />
              {o.client?.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.client.color }} />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {note && <p className="text-xs text-zinc-500">Notitie wordt: <span className="text-zinc-300">{note}</span></p>}
    </div>
  )
}

/**
 * Ongedaan maken / opnieuw doen van een samenvoeging, voor de stapel (Ctrl+Z)
 * en de knop in de melding. Opnieuw doen voegt dezelfde boekingen opnieuw
 * samen (met een nieuwe samenvoeging om later weer ongedaan te maken).
 */
export function mergeUndoEntry({ mergeId, ids, keepFrom, label, onChange }: {
  mergeId: string
  ids: string[]
  keepFrom: string | null
  label: string
  onChange: () => void
}): UndoEntry {
  let current = mergeId
  return {
    label,
    undo: async () => { await send('/api/materiaal/bookings/merge/undo', 'POST', { merge_id: current }); onChange() },
    redo: async () => {
      const r = await send<{ merge_id: string }>('/api/materiaal/bookings/merge', 'POST', { ids, keep_from: keepFrom })
      current = r.merge_id
      onChange()
    },
  }
}
