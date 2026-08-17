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
    } catch {
      setError('Kon je token niet ophalen. Probeer de pagina te herladen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRegenerate() {
    if (!confirm('Nieuwe token aanmaken? De oude stopt dan met werken — je moet de snelkoppeling opnieuw instellen.')) return
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

      {token && (
        <>
          <CopyField label="Endpoint URL (Get Contents of URL)" value={endpointUrl} />
          <CopyField label="Authorization header (Bearer token)" value={`Bearer ${token}`} />
        </>
      )}

      <div>
        <p className="text-xs font-medium text-zinc-500 mb-1.5">Instellen in de snelkoppeling</p>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open de Reel-snelkoppeling in de Shortcuts-app en bewerk hem</li>
          <li>Zet de &quot;Get Contents of URL&quot;-actie op bovenstaande endpoint URL</li>
          <li>Voeg een header toe: <span className="text-zinc-300 font-mono">Authorization</span> met bovenstaande waarde</li>
        </ol>
      </div>

      <button
        onClick={handleRegenerate}
        disabled={regenerating}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
        style={{ border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <RefreshCw size={13} className={regenerating ? 'animate-spin' : undefined} />
        Nieuwe token aanmaken
      </button>
    </div>
  )
}
