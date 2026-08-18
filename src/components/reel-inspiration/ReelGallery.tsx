'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Clock, AlertCircle, Trash2, X } from 'lucide-react'
import { ReelInspiration } from '@/types/database'
import { REEL_CATEGORIES } from '@/lib/reel-categories'

// ─── Instagram embed script ────────────────────────────────────────────────
// embed_html is Instagram's own oEmbed markup (a <blockquote> placeholder) —
// it only renders as the actual playable post once instagram.com/embed.js
// has run and processed the page. Loaded lazily, once, on first preview.

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

let embedScriptPromise: Promise<void> | null = null

function loadInstagramEmbedScript(): Promise<void> {
  if (window.instgrm) return Promise.resolve()
  if (embedScriptPromise) return embedScriptPromise

  embedScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://www.instagram.com/embed.js'
    script.async = true
    script.onload = () => resolve()
    document.body.appendChild(script)
  })
  return embedScriptPromise
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function ReelModal({ reel, onClose, onDelete }: { reel: ReelInspiration; onClose: () => void; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadInstagramEmbedScript().then(() => window.instgrm?.Embeds.process())
  }, [reel.id])

  async function handleDelete() {
    if (!confirm('Deze reel definitief verwijderen?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/reels/${reel.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(reel.id)
    } catch {
      setDeleting(false)
      alert('Verwijderen mislukt. Probeer opnieuw.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl"
        style={{ background: '#000' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 sticky top-0 z-10 bg-black/90">
          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ExternalLink size={12} /> Open in Instagram
          </a>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
              title="Verwijderen"
            >
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors" title="Sluiten">
              <X size={16} />
            </button>
          </div>
        </div>

        {reel.embed_html ? (
          <div dangerouslySetInnerHTML={{ __html: reel.embed_html }} />
        ) : (
          <p className="p-6 text-sm text-zinc-500">Geen embed beschikbaar voor deze post.</p>
        )}

        {(reel.category || reel.tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {reel.category && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300">{reel.category}</span>
            )}
            {reel.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function ReelCard({ reel, onOpen, onDelete }: { reel: ReelInspiration; onOpen: () => void; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Deze reel definitief verwijderen?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/reels/${reel.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(reel.id)
    } catch {
      setDeleting(false)
      alert('Verwijderen mislukt. Probeer opnieuw.')
    }
  }

  return (
    <button
      onClick={onOpen}
      className="group flex flex-col rounded-xl overflow-hidden transition-colors text-left"
      style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="relative aspect-[3/4] bg-zinc-900">
        {reel.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reel.thumbnail_url}
            alt={reel.caption ?? 'Instagram reel'}
            loading="lazy"
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
            Geen thumbnail
          </div>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:text-red-400 disabled:opacity-50"
          title="Verwijderen"
        >
          <Trash2 size={13} />
        </button>
        <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink size={13} className="text-white" />
        </div>

        {reel.status === 'pending' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 text-[11px] text-zinc-300">
            <Clock size={11} className="animate-pulse" /> Classificeren…
          </div>
        )}
        {reel.status === 'error' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-950/80 text-[11px] text-red-300">
            <AlertCircle size={11} /> Fout
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {reel.caption && (
          <p className="text-xs text-zinc-300 line-clamp-2 leading-snug">{reel.caption}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500 truncate">
            {reel.author ? `@${reel.author}` : 'Onbekend account'}
          </span>
          <span className="text-[11px] text-zinc-600 flex-shrink-0">
            {new Date(reel.saved_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        {reel.category && (
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300">
              {reel.category}
            </span>
            {reel.tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Gallery ────────────────────────────────────────────────────────────────

export default function ReelGallery({ reels: initialReels }: { reels: ReelInspiration[] }) {
  const [reels, setReels] = useState(initialReels)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  function handleDelete(id: string) {
    setReels(prev => prev.filter(r => r.id !== id))
    setPreviewId(prev => (prev === id ? null : prev))
  }

  const categoriesInUse = REEL_CATEGORIES.filter(c => reels.some(r => r.category === c))
  const filtered = activeCategory ? reels.filter(r => r.category === activeCategory) : reels
  const previewReel = reels.find(r => r.id === previewId) ?? null

  if (reels.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nog geen reels bewaard. Deel een Instagram Reel via de snelkoppeling om hem hier te zien verschijnen.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {categoriesInUse.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: activeCategory === null ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: activeCategory === null ? '#fff' : '#a1a1aa',
            }}
          >
            Alles ({reels.length})
          </button>
          {categoriesInUse.map(category => {
            const count = reels.filter(r => r.category === category).length
            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: activeCategory === category ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: activeCategory === category ? '#fff' : '#a1a1aa',
                }}
              >
                {category} ({count})
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(reel => (
          <ReelCard key={reel.id} reel={reel} onOpen={() => setPreviewId(reel.id)} onDelete={handleDelete} />
        ))}
      </div>

      {previewReel && (
        <ReelModal reel={previewReel} onClose={() => setPreviewId(null)} onDelete={handleDelete} />
      )}
    </div>
  )
}
