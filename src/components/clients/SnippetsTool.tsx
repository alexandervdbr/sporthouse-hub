'use client'

import { useState } from 'react'
import { Scissors, Copy, Check, Loader2, RefreshCw } from 'lucide-react'

interface Snippet {
  quote: string
  reden: string
  platform: string[]
  toon: string
}

const TOON_COLORS: Record<string, string> = {
  grappig:       '#d97706',
  confronterend: '#dc2626',
  emotioneel:    '#7c3aed',
  verrassend:    '#0284c7',
  inspirerend:   '#3A913F',
  controversieel:'#db2777',
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  'Instagram Reels': <span className="text-[10px] font-bold">IG</span>,
  'TikTok':          <span className="text-[10px] font-bold">TK</span>,
  'YouTube Shorts':  <span className="text-[10px] font-bold">YT</span>,
}

function SnippetCard({ snippet, index }: { snippet: Snippet; index: number }) {
  const [copied, setCopied] = useState(false)
  const color = TOON_COLORS[snippet.toon.toLowerCase()] ?? '#666663'

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet.quote)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
      {/* Top bar with number + toon */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-zinc-600">#{index + 1}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {snippet.toon}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {snippet.platform.map(p => (
            <span
              key={p}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400"
            >
              {PLATFORM_ICONS[p] ?? null}
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Quote */}
      <div className="px-4 py-4">
        <blockquote
          className="text-sm text-sh-grey leading-relaxed"
          style={{ borderLeft: `3px solid ${color}`, paddingLeft: '12px' }}
        >
          &ldquo;{snippet.quote}&rdquo;
        </blockquote>
      </div>

      {/* Reden + copy */}
      <div className="flex items-start justify-between gap-3 px-4 pb-4">
        <p className="text-xs text-zinc-500 leading-relaxed flex-1">{snippet.reden}</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-sh-grey bg-zinc-800 border border-zinc-700 rounded-lg transition-colors flex-shrink-0"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Gekopieerd' : 'Kopieer'}
        </button>
      </div>
    </div>
  )
}

export default function SnippetsTool({ podcastName }: { clientId: string; podcastName: string }) {
  const [transcript, setTranscript] = useState('')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!transcript.trim()) return
    setLoading(true)
    setError(null)
    setSnippets([])

    try {
      const res = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, podcastName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSnippets(data.snippets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is een fout opgetreden.')
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">
            Transcript of uitgeschreven tekst
          </label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Plak hier het transcript van de aflevering…"
            rows={10}
            className="w-full px-3 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none leading-relaxed"
          />
          <p className="text-xs text-zinc-700 mt-1.5">
            {transcript.length > 0 ? `${transcript.split(/\s+/).filter(Boolean).length} woorden` : 'Tip: hoe meer tekst, hoe beter de snippets'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={loading || !transcript.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#3A913F' }}
          >
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : <Scissors size={14} />
            }
            {loading ? 'Snippets zoeken…' : 'Genereer snippets'}
          </button>

          {snippets.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:text-sh-grey bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
            >
              <RefreshCw size={13} />
              Opnieuw
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 px-1">{error}</p>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 size={24} className="animate-spin text-zinc-600" />
          <p className="text-sm text-zinc-500">Claude analyseert het transcript…</p>
        </div>
      )}

      {snippets.length > 0 && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {snippets.length} mogelijke snippets
            </p>
          </div>
          {snippets.map((s, i) => (
            <SnippetCard key={i} snippet={s} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
