'use client'

import { useEffect, useState } from 'react'
import { personKey, type Department } from '@/lib/planning-config'

// "Wie ben jij in dit rooster?" — needed because a restricted user's
// column comes from their admin-assigned permissions, but most people with
// full edit rights have no such assignment. This is the generic fallback
// that works for everyone, admin or not, and is what "Mijn week" defaults
// to on first use.
//
// `guess` en wat eruit komt zijn sleutels (`afdeling|naam`), geen kale namen.
// De naam alleen was niet genoeg: het rooster heeft echt dubbele voornamen
// ("Thibault" bij twee afdelingen), en met de naam als waarde kozen beide
// opties dezelfde persoon — de tweede kon zichzelf dus niet kiezen.
export default function NamePicker({
  depts, guess, onPick, onCancel, canCancel = true,
}: {
  depts: Department[]
  guess: string | null
  onPick: (personKey: string) => void
  onCancel: () => void
  canCancel?: boolean
}) {
  const [value, setValue] = useState(guess ?? '')

  useEffect(() => {
    if (!canCancel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, canCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={canCancel ? onCancel : undefined}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Wie ben jij in dit rooster?</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Zo weten we welk rooster &ldquo;Mijn week&rdquo; van jou moet tonen.
          </p>
        </div>
        <select
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 outline-none focus:border-zinc-500"
        >
          <option value="">Kies je naam…</option>
          {depts.map(d => (
            <optgroup key={d.name} label={d.name}>
              {d.employees.map(emp => {
                const key = personKey({ dept: d.name, emp })
                return <option key={key} value={key}>{emp}</option>
              })}
            </optgroup>
          ))}
        </select>
        <div className="flex items-center justify-end gap-2">
          {canCancel && (
            <button onClick={onCancel} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Annuleren
            </button>
          )}
          <button
            onClick={() => value && onPick(value)}
            disabled={!value}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            Bevestigen
          </button>
        </div>
      </div>
    </div>
  )
}
