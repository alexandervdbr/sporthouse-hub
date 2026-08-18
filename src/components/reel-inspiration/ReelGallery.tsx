'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Clock, AlertCircle, Trash2, X, Search, Plus } from 'lucide-react'
import { ReelInspiration } from '@/types/database'
import { REEL_CATEGORIES } from '@/lib/reel-categories'
import { REEL_MEDIA_TYPES } from '@/lib/reel-media-types'

type ReelUpdate = { category?: string | null; media_type?: string | null; tags?: string[] }

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

// ─── Shared editor bits ────────────────────────────────────────────────────

function ChipSelect({ options, value, onChange }: { options: readonly string[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={(e) => { e.stopPropagation(); onChange(opt) }}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
          style={{
            background: value === opt ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: value === opt ? '#fff' : '#a1a1aa',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function TagsEditor({ tags, onAdd, onRemove }: { tags: string[]; onAdd: (tag: string) => void; onRemove: (tag: string) => void }) {
  const [input, setInput] = useState('')

  function submit() {
    const value = input.trim()
    if (value && !tags.includes(value)) onAdd(value)
    setInput('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] text-zinc-400"
            style={{ border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {tag}
            <button onClick={(e) => { e.stopPropagation(); onRemove(tag) }} className="hover:text-red-400 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          placeholder="Nieuwe tag…"
          className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-transparent outline-none text-zinc-300 placeholder:text-zinc-600"
          style={{ border: '1px solid rgba(255,255,255,0.10)' }}
        />
        <button
          onClick={submit}
          className="px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function ReelModal({
  reel, onClose, onDelete, onUpdate,
}: {
  reel: ReelInspiration
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: ReelUpdate) => void
}) {
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

        <div className="px-4 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Type</p>
            <ChipSelect
              options={REEL_MEDIA_TYPES}
              value={reel.media_type}
              onChange={v => onUpdate(reel.id, { media_type: v })}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Categorie</p>
            <ChipSelect
              options={REEL_CATEGORIES}
              value={reel.category}
              onChange={v => onUpdate(reel.id, { category: v })}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Tags</p>
            <TagsEditor
              tags={reel.tags}
              onAdd={tag => onUpdate(reel.id, { tags: [...reel.tags, tag] })}
              onRemove={tag => onUpdate(reel.id, { tags: reel.tags.filter(t => t !== tag) })}
            />
          </div>
        </div>
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

        {reel.media_type && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/70 text-zinc-200">
            {reel.media_type}
          </span>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:text-red-400 disabled:opacity-50"
          title="Verwijderen"
        >
          <Trash2 size={13} />
        </button>
        <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink size={13} className="text-white" />
        </div>

        {reel.status === 'pending' && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 text-[11px] text-zinc-300">
            <Clock size={11} className="animate-pulse" /> Classificeren…
          </div>
        )}
        {reel.status === 'error' && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-950/80 text-[11px] text-red-300">
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
        {(reel.category || reel.tags.length > 0) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {reel.category && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300">
                {reel.category}
              </span>
            )}
            {reel.tags.slice(0, 4).map(tag => (
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

// ─── Filter pill row ────────────────────────────────────────────────────────

function PillRow({ label, options, counts, active, onChange }: {
  label: string
  options: readonly string[]
  counts: Record<string, number>
  active: string | null
  onChange: (v: string | null) => void
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wide">{label}</span>
      <button
        onClick={() => onChange(null)}
        className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
        style={{
          background: active === null ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: active === null ? '#fff' : '#a1a1aa',
        }}
      >
        Alles ({total})
      </button>
      {options.filter(o => counts[o] > 0).map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            background: active === opt ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: active === opt ? '#fff' : '#a1a1aa',
          }}
        >
          {opt} ({counts[opt]})
        </button>
      ))}
    </div>
  )
}

// ─── Gallery ────────────────────────────────────────────────────────────────

export default function ReelGallery({ reels: initialReels }: { reels: ReelInspiration[] }) {
  const [reels, setReels] = useState(initialReels)
  const [query, setQuery] = useState('')
  const [activeMediaType, setActiveMediaType] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  function handleDelete(id: string) {
    setReels(prev => prev.filter(r => r.id !== id))
    setPreviewId(prev => (prev === id ? null : prev))
  }

  function handleUpdate(id: string, patch: ReelUpdate) {
    setReels(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    fetch(`/api/reels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {
      alert('Opslaan mislukt. Herlaad de pagina en probeer opnieuw.')
    })
  }

  const mediaTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const type of REEL_MEDIA_TYPES) counts[type] = reels.filter(r => r.media_type === type).length
    return counts
  }, [reels])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of REEL_CATEGORIES) counts[cat] = reels.filter(r => r.category === cat).length
    return counts
  }, [reels])

  const filtered = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)

    return reels.filter(r => {
      if (activeMediaType && r.media_type !== activeMediaType) return false
      if (activeCategory && r.category !== activeCategory) return false
      if (words.length === 0) return true

      const searchable = [r.caption, r.author, r.category, r.media_type, ...r.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return words.every(w => searchable.includes(w))
    })
  }, [reels, query, activeMediaType, activeCategory])

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
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <Search size={14} className="text-zinc-500 flex-shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Zoek op stijl, sfeer, onderwerp, account…"
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <PillRow label="Type" options={REEL_MEDIA_TYPES} counts={mediaTypeCounts} active={activeMediaType} onChange={setActiveMediaType} />
      <PillRow label="Categorie" options={REEL_CATEGORIES} counts={categoryCounts} active={activeCategory} onChange={setActiveCategory} />

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">Niets gevonden.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(reel => (
            <ReelCard key={reel.id} reel={reel} onOpen={() => setPreviewId(reel.id)} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {previewReel && (
        <ReelModal reel={previewReel} onClose={() => setPreviewId(null)} onDelete={handleDelete} onUpdate={handleUpdate} />
      )}
    </div>
  )
}
