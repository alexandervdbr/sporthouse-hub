'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { api } from './api'

// "Mijn beschikbaarheid": drie grote knoppen, meteen opgeslagen. Bij Beperkt
// of Niet beschikbaar een optionele datum "Weer beschikbaar vanaf".
const OPTIONS = [
  { key: 'beschikbaar', label: 'Beschikbaar', dot: 'bg-emerald-500' },
  { key: 'beperkt', label: 'Beperkt', dot: 'bg-amber-400' },
  { key: 'niet_beschikbaar', label: 'Niet beschikbaar', dot: 'bg-red-500' },
] as const

export default function AvailabilityCard({ initial, initialFrom }: { initial: string; initialFrom: string | null }) {
  const [value, setValue] = useState(initial)
  const [from, setFrom] = useState(initialFrom ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')

  async function save(next: string, nextFrom: string) {
    setValue(next); setFrom(next === 'beschikbaar' ? '' : nextFrom); setState('busy')
    try {
      await api.setAvailability(next, next === 'beschikbaar' ? null : nextFrom || null)
      setState('saved')
    } catch {
      setState('error')
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4" aria-labelledby="beschikbaarheid">
      <div className="flex items-center justify-between gap-3">
        <h2 id="beschikbaarheid" className="text-base font-semibold text-white">Mijn beschikbaarheid</h2>
        <span className="text-sm text-zinc-400" aria-live="polite">
          {state === 'busy' && <Loader2 size={16} className="animate-spin" aria-label="Opslaan" />}
          {state === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-400"><Check size={16} /> Opgeslagen</span>}
          {state === 'error' && <span className="text-red-400">Niet opgeslagen, probeer opnieuw</span>}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="beschikbaarheid">
        {OPTIONS.map(o => {
          const active = value === o.key
          return (
            <button key={o.key} type="button" role="radio" aria-checked={active} disabled={state === 'busy'}
              onClick={() => save(o.key, from)}
              className={`min-h-[48px] rounded-xl border px-4 text-base font-medium flex items-center gap-2.5 transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50
                ${active ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} aria-hidden />
              {o.label}
            </button>
          )
        })}
      </div>
      {value !== 'beschikbaar' && (
        <label className="mt-3 block">
          <span className="text-sm text-zinc-400">Weer beschikbaar vanaf (optioneel)</span>
          <input type="date" value={from} onChange={e => save(value, e.target.value)}
            className="mt-1 block w-full h-12 rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-base text-white
              focus:outline-none focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-[#3A913F]/40" />
        </label>
      )}
    </section>
  )
}
