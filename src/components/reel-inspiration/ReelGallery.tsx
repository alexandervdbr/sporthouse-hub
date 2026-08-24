'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Clock, AlertCircle, Trash2, X, Search, Plus, ChevronLeft, ChevronRight, Folder, FolderPlus, LayoutGrid, Shuffle, RefreshCw } from 'lucide-react'
import { ReelInspiration } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

const UNSORTED = 'Ongesorteerd'

type ReelUpdate = {
  media_type?: string | null
  tags?: string[]
  thumbnail_url?: string | null
  thumbnail_drive_id?: string | null
  confidence?: 'high' | 'medium' | 'low' | null
}

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

function TagsEditor({
  tags, existingTags, onAdd, onRemove,
}: {
  tags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  function submit(value: string) {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed)
    setInput('')
    setShowSuggestions(false)
  }

  const suggestions = input.trim().length > 0
    ? existingTags
        .filter(t => !tags.includes(t) && t.toLowerCase().includes(input.trim().toLowerCase()))
        .slice(0, 6)
    : []

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
      <div className="relative" onClick={e => e.stopPropagation()}>
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(input) } }}
            placeholder="Nieuwe tag… (bestaande worden gesuggereerd)"
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-transparent outline-none text-zinc-300 placeholder:text-zinc-600"
            style={{ border: '1px solid rgba(255,255,255,0.10)' }}
          />
          <button
            onClick={() => submit(input)}
            className="px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <Plus size={13} />
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-10"
            style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {suggestions.map(tag => (
              <button
                key={tag}
                onClick={() => submit(tag)}
                className="block w-full text-left px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function ReelModal({
  reel, existingTags, mediaTypes, isAdmin, onClose, onDelete, onUpdate, onNavigate, hasPrev, hasNext,
}: {
  reel: ReelInspiration
  existingTags: string[]
  mediaTypes: string[]
  isAdmin: boolean
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: ReelUpdate) => void
  onNavigate: (direction: 1 | -1) => void
  hasPrev: boolean
  hasNext: boolean
}) {
  const [deleting, setDeleting] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [embedHtml, setEmbedHtml] = useState<string | null>(null)
  const [embedLoading, setEmbedLoading] = useState(true)

  useEffect(() => {
    setEmbedHtml(null)
    setEmbedLoading(true)
    fetch(`/api/reels/${reel.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setEmbedHtml(data?.embed_html ?? null))
      .catch(() => setEmbedHtml(null))
      .finally(() => setEmbedLoading(false))
  }, [reel.id])

  useEffect(() => {
    if (!embedHtml) return
    loadInstagramEmbedScript().then(() => window.instgrm?.Embeds.process())
  }, [embedHtml])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(-1)
      if (e.key === 'ArrowRight' && hasNext) onNavigate(1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, onNavigate, onClose])

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

  async function handleRetag() {
    setRetagging(true)
    try {
      const res = await fetch(`/api/reels/${reel.id}/retag`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const row = await res.json()
      onUpdate(reel.id, {
        media_type: row.media_type,
        tags: row.tags,
        confidence: row.confidence,
        thumbnail_url: row.thumbnail_url,
        thumbnail_drive_id: row.thumbnail_drive_id,
      })
    } catch {
      alert('Herclassificeren mislukt. Probeer opnieuw.')
    } finally {
      setRetagging(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); onNavigate(-1) }}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
          title="Vorige"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); onNavigate(1) }}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
          title="Volgende"
        >
          <ChevronRight size={20} />
        </button>
      )}

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
            {isAdmin && (
              <button
                onClick={handleRetag}
                disabled={retagging}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                title="Herclassificeer"
              >
                <RefreshCw size={15} className={retagging ? 'animate-spin' : undefined} />
              </button>
            )}
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

        {embedLoading ? (
          <p className="p-6 text-sm text-zinc-500">Laden…</p>
        ) : embedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: embedHtml }} />
        ) : (
          <p className="p-6 text-sm text-zinc-500">Geen embed beschikbaar voor deze post.</p>
        )}

        <div className="px-4 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Type</p>
            <ChipSelect
              options={mediaTypes}
              value={reel.media_type}
              onChange={v => onUpdate(reel.id, { media_type: v })}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Tags</p>
            <TagsEditor
              tags={reel.tags}
              existingTags={existingTags}
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
      className="group flex flex-col rounded-xl overflow-hidden transition-colors text-left min-w-0"
      style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="relative aspect-[3/4] bg-zinc-900 overflow-hidden min-h-0">
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
        {reel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
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

// ─── Folder tile ────────────────────────────────────────────────────────────

function FolderTile({ label, reels, onOpen }: { label: string; reels: ReelInspiration[]; onOpen: () => void }) {
  const preview = reels.slice(0, 4)
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col rounded-xl overflow-hidden transition-colors text-left min-w-0"
      style={{ background: 'rgba(24,24,24,0.97)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 aspect-[3/4] bg-zinc-900 overflow-hidden min-h-0">
        {preview.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-zinc-700 text-xs">Leeg</div>
        )}
        {preview.map(r => (
          <div key={r.id} className="bg-zinc-800 overflow-hidden min-w-0 min-h-0">
            {r.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover object-center" />
            )}
          </div>
        ))}
        {preview.length > 0 && preview.length < 4 &&
          Array.from({ length: 4 - preview.length }).map((_, i) => <div key={i} className="bg-zinc-900" />)}
      </div>
      <div className="p-3 flex items-center gap-2">
        <Folder size={14} className="text-zinc-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">{label}</p>
          <p className="text-xs text-zinc-500">{reels.length} item{reels.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </button>
  )
}

// ─── Gallery ────────────────────────────────────────────────────────────────

export default function ReelGallery({ reels: initialReels, isAdmin, mediaTypes: initialMediaTypes, canCreateTypes }: {
  reels: ReelInspiration[]
  isAdmin: boolean
  mediaTypes: string[]
  canCreateTypes: boolean
}) {
  const [reels, setReels] = useState(initialReels)
  const [mediaTypes, setMediaTypes] = useState(initialMediaTypes)
  const [creatingType, setCreatingType] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders')
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'shuffle'>('newest')
  const [shuffleTick, setShuffleTick] = useState(0)

  // Live updates across everyone viewing the board — a save, a finished
  // classification, an edit, or a delete from anyone shows up immediately
  // without a manual refresh. Same Realtime mechanism already used for chat
  // unread counts (see Sidebar.tsx); requires reel_inspiration to be added
  // to the supabase_realtime publication (migration 0017).
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('reel-inspiration-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reel_inspiration' },
        (payload) => {
          const row = payload.new as ReelInspiration
          setReels(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reel_inspiration' },
        (payload) => {
          const row = payload.new as ReelInspiration
          setReels(prev => prev.map(r => (r.id === row.id ? { ...r, ...row } : r)))
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reel_inspiration' },
        (payload) => {
          const oldRow = payload.old as { id: string }
          setReels(prev => prev.filter(r => r.id !== oldRow.id))
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // New types (e.g. someone with the permission adding "3D") show up live
  // for everyone too, same mechanism as the reels themselves.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('reel-media-types-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reel_media_types' },
        (payload) => {
          const row = payload.new as { name: string }
          setMediaTypes(prev => (prev.includes(row.name) ? prev : [...prev, row.name]))
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleCreateType() {
    const name = prompt('Naam voor het nieuwe type (bv. "3D"):')?.trim()
    if (!name) return
    setCreatingType(true)
    try {
      const res = await fetch('/api/reel-media-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setMediaTypes(prev => (prev.includes(created.name) ? prev : [...prev, created.name]))
    } catch {
      alert('Aanmaken mislukt. Probeer opnieuw.')
    } finally {
      setCreatingType(false)
    }
  }

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

  const isSearching = query.trim().length > 0
  const showFolders = viewMode === 'folders' && !isSearching && openFolder === null

  const folderReels = useMemo(() => {
    const groups: Record<string, ReelInspiration[]> = {}
    for (const type of mediaTypes) groups[type] = reels.filter(r => r.media_type === type)
    groups[UNSORTED] = reels.filter(r => !r.media_type)
    return groups
  }, [reels, mediaTypes])

  // Base set for the current view: everything (View all / search) or just
  // the open folder's items (Folders mode, drilled in).
  const scoped = useMemo(() => {
    if (isSearching || viewMode === 'all') return reels
    if (openFolder) return folderReels[openFolder] ?? []
    return []
  }, [reels, isSearching, viewMode, openFolder, folderReels])

  const filtered = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return scoped

    return scoped.filter(r => {
      const searchable = [r.caption, r.author, r.media_type, ...r.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return words.every(w => searchable.includes(w))
    })
  }, [scoped, query])

  // Recomputed only on an explicit shuffle click (or when the item set
  // changes) — not on every render, so the order stays stable while browsing.
  const shuffleOrder = useMemo(() => {
    const ids = reels.map(r => r.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    return new Map(ids.map((id, i) => [id, i]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleTick, reels.length])

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sortMode === 'newest') list.sort((a, b) => b.saved_at.localeCompare(a.saved_at))
    else if (sortMode === 'oldest') list.sort((a, b) => a.saved_at.localeCompare(b.saved_at))
    else list.sort((a, b) => (shuffleOrder.get(a.id) ?? 0) - (shuffleOrder.get(b.id) ?? 0))
    return list
  }, [filtered, sortMode, shuffleOrder])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const r of reels) for (const t of r.tags) set.add(t)
    return Array.from(set).sort()
  }, [reels])

  // Looked up from the unfiltered `reels`, not `sorted` — editing a reel's
  // type while that exact folder is open would otherwise drop it out of
  // `sorted` mid-edit and yank the modal closed. `previewIndex` (used
  // only for prev/next) is allowed to go to -1 in that case; it just means
  // arrow-nav is unavailable until the modal's closed and reopened.
  const previewReel = reels.find(r => r.id === previewId) ?? null
  const previewIndex = sorted.findIndex(r => r.id === previewId)

  function handleNavigate(direction: 1 | -1) {
    const nextIndex = previewIndex + direction
    if (nextIndex >= 0 && nextIndex < sorted.length) setPreviewId(sorted[nextIndex].id)
  }

  if (reels.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nog geen reels bewaard. Deel een Instagram Reel via de snelkoppeling om hem hier te zien verschijnen.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2 rounded-lg"
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

        {!isSearching && (
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
            <button
              onClick={() => { setViewMode('folders'); setOpenFolder(null) }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: viewMode === 'folders' ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: viewMode === 'folders' ? '#fff' : '#a1a1aa',
              }}
            >
              <Folder size={13} /> Mapjes
            </button>
            <button
              onClick={() => setViewMode('all')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: viewMode === 'all' ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: viewMode === 'all' ? '#fff' : '#a1a1aa',
              }}
            >
              <LayoutGrid size={13} /> Alles bekijken
            </button>
          </div>
        )}
      </div>

      {showFolders ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
          {[...mediaTypes, UNSORTED].filter(type => folderReels[type]?.length > 0).map(type => (
            <FolderTile key={type} label={type} reels={folderReels[type]} onOpen={() => setOpenFolder(type)} />
          ))}
          {canCreateTypes && (
            <button
              onClick={handleCreateType}
              disabled={creatingType}
              className="flex flex-col items-center justify-center gap-2 rounded-xl aspect-[3/4] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              style={{ border: '1px dashed rgba(255,255,255,0.15)' }}
            >
              <FolderPlus size={20} className={creatingType ? 'animate-pulse' : undefined} />
              <span className="text-xs font-medium">Nieuw type</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {!isSearching && viewMode === 'folders' && openFolder && (
            <button
              onClick={() => setOpenFolder(null)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft size={13} /> Terug naar mapjes — <span className="font-medium text-zinc-300">{openFolder}</span>
            </button>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wide">Sorteer</span>
            {(['newest', 'oldest'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: sortMode === mode ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: sortMode === mode ? '#fff' : '#a1a1aa',
                }}
              >
                {mode === 'newest' ? 'Nieuwste' : 'Oudste'}
              </button>
            ))}
            <button
              onClick={() => { setSortMode('shuffle'); setShuffleTick(t => t + 1) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: sortMode === 'shuffle' ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,24,0.97)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: sortMode === 'shuffle' ? '#fff' : '#a1a1aa',
              }}
            >
              <Shuffle size={12} /> Shuffle
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-zinc-500">Niets gevonden.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sorted.map(reel => (
                <ReelCard key={reel.id} reel={reel} onOpen={() => setPreviewId(reel.id)} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {previewReel && (
        <ReelModal
          reel={previewReel}
          existingTags={allTags}
          mediaTypes={mediaTypes}
          isAdmin={isAdmin}
          onClose={() => setPreviewId(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onNavigate={handleNavigate}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < sorted.length - 1}
        />
      )}
    </div>
  )
}
