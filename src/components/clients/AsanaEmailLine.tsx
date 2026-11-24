'use client'

// De regel onder het mailadres van een teamlid in de config-tab van een tool
// die naar Asana pusht: welk adres er in Asana gebruikt wordt, of die persoon
// daar gevonden wordt, en een veld om een afwijkend adres in te stellen.
// Zie src/lib/asana.ts.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

export type AsanaStatus = Record<string, { asana_email: string | null; found: boolean | null }>

// Eén verzoek voor de hele ledenlijst, opnieuw als die lijst verandert.
export function useAsanaStatus(emails: string[], enabled: boolean) {
  const [status, setStatus] = useState<AsanaStatus>({})
  const key = [...new Set(emails)].sort().join(',')

  const reload = useCallback(() => {
    if (!enabled || !key) return
    fetch('/api/asana/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: key.split(',') }),
    })
      .then(r => (r.ok ? r.json() : {}))
      .then(setStatus)
      .catch(() => {})
  }, [enabled, key])

  useEffect(() => { reload() }, [reload])
  return { status, reload }
}

export function AsanaEmailLine({
  email,
  status,
  onSaved,
}: {
  email: string
  status: AsanaStatus[string] | undefined
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const override = status?.asana_email ?? null

  function open() {
    setValue(override ?? '')
    setError(null)
    setEditing(true)
  }

  async function save(next: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/asana/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, asana_email: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Opslaan mislukt.')
        return
      }
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save(value)
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="adres op Asana"
            className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => save(value)}
            disabled={saving}
            className="text-xs px-2 py-1 rounded-md bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : 'Bewaar'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs px-1.5 py-1 text-zinc-500 hover:text-zinc-300"
          >
            Annuleer
          </button>
        </div>
        <p className="text-[11px] text-zinc-600 mt-1">
          {error ? <span className="text-red-400">{error}</span> : 'Leeg laten = hetzelfde adres als in de hub. Geldt voor alle Asana-tools.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[11px] mt-0.5">
      {override && <span className="text-zinc-400 truncate max-w-full">Asana: {override}</span>}
      {status?.found === false && (
        <span className="inline-flex items-center gap-1 text-amber-400">
          <AlertCircle size={10} /> niet gevonden in Asana
        </span>
      )}
      <button onClick={open} className="text-zinc-600 hover:text-zinc-300 underline-offset-2 hover:underline">
        {override ? 'wijzig' : 'Ander adres op Asana?'}
      </button>
    </div>
  )
}
