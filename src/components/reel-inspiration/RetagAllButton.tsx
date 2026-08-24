'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function RetagAllButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClick() {
    if (!confirm('Thumbnails herstellen en ontbrekende classificaties aanvullen? Items die al een type en tags hebben, worden niet opnieuw gedaan.')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/reels/retag', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setResult(`${data.reclassified} opnieuw getagd, ${data.repaired} thumbnails hersteld (van ${data.total}).`)
      setTimeout(() => window.location.reload(), 1200)
    } catch {
      setResult('Mislukt. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
        style={{ border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
        {loading ? 'Bezig…' : 'Ontbrekende items herstellen'}
      </button>
      {result && <span className="text-xs text-zinc-500">{result}</span>}
    </div>
  )
}
