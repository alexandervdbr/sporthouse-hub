'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'

// ─── Copy field ───────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 mb-1.5">{label}</p>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
        style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <code className="flex-1 text-sm text-zinc-300 break-all font-mono">{value}</code>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 p-1.5 rounded transition-colors text-zinc-500 hover:text-zinc-300"
          title="Kopiëren"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReelInspirationSetup() {
  const [token, setToken] = useState<string | null>(null)
  const [teamToken, setTeamToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/reel-tokens')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setToken(data.token)
      setTeamToken(data.team_token ?? null)
    } catch {
      setError('Kon je token niet ophalen. Probeer de pagina te herladen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRegenerate() {
    if (!confirm('Nieuwe persoonlijke token aanmaken? De oude stopt dan met werken. De teamtoken verandert niet.')) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reel-tokens', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setToken(data.token)
    } catch {
      setError('Vernieuwen mislukt. Probeer opnieuw.')
    } finally {
      setRegenerating(false)
    }
  }

  const endpointUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/save-reel`
    : '/api/save-reel'

  if (loading) {
    return <p className="text-sm text-zinc-500">Laden…</p>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-3 py-2.5 rounded-lg text-sm text-red-300" style={{ background: 'rgba(127,29,29,0.25)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      <CopyField label="Endpoint URL (Get Contents of URL)" value={endpointUrl} />

      {/* De teamtoken is wat in de gedeelde snelkoppeling hoort: hij staat in
          Vercel, niet in de database, en verandert niet als iemand hieronder
          zijn persoonlijke token vernieuwt. */}
      <div>
        {teamToken ? (
          <CopyField label="Authorization header — teamtoken (voor de gedeelde snelkoppeling)" value={`Bearer ${teamToken}`} />
        ) : (
          <div className="px-3 py-2.5 rounded-lg text-sm text-amber-300" style={{ background: 'rgba(120,53,15,0.2)', border: '1px solid rgba(251,191,36,0.25)' }}>
            Nog geen teamtoken ingesteld. Zet <span className="font-mono">SAVE_REEL_TEAM_TOKEN</span> in Vercel
            (minstens 32 tekens) en deploy opnieuw — dan verschijnt hij hier.
          </div>
        )}
        <p className="text-xs text-zinc-600 mt-1.5">
          Gebruik deze in de snelkoppeling die je met collega&apos;s deelt. Hij blijft werken, ook als iemand zijn persoonlijke token vernieuwt.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-500 mb-1.5">Instellen in de snelkoppeling</p>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open de Reel-snelkoppeling in de Shortcuts-app en bewerk hem</li>
          <li>Zet de &quot;Get Contents of URL&quot;-actie op bovenstaande endpoint URL</li>
          <li>Voeg een header toe: <span className="text-zinc-300 font-mono">Authorization</span> met de teamtoken hierboven</li>
          <li>Deel hem opnieuw (Delen → iCloud-link kopiëren): een gedeelde snelkoppeling is een kopie, collega&apos;s moeten de nieuwe één keer toevoegen</li>
        </ol>
      </div>

      {token && (
        <details className="group">
          <summary className="text-xs font-medium text-zinc-500 hover:text-zinc-300 cursor-pointer select-none">
            Persoonlijke token (alleen voor je eigen snelkoppeling)
          </summary>
          <div className="mt-3 space-y-3">
            <CopyField label="Authorization header — persoonlijk" value={`Bearer ${token}`} />
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              style={{ border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <RefreshCw size={13} className={regenerating ? 'animate-spin' : undefined} />
              Nieuwe persoonlijke token aanmaken
            </button>
          </div>
        </details>
      )}
    </div>
  )
}
