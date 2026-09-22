'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, FileText, Mic, BookOpen, KanbanSquare, X } from 'lucide-react'

interface SearchResults {
  clients:   { id: string; name: string; description: string | null; color: string | null; category: string }[]
  files:     { id: string; filename: string; description: string | null; client_id: string }[]
  meetings:  { id: string; title: string; client_id: string; created_at: string }[]
  documents: { id: string; title: string; client_id: string }[]
  projects:  { id: string; name: string; description: string | null; status: string }[]
}

interface FlatResult {
  id: string
  label: string
  sublabel?: string
  href: string
  icon: React.ReactNode
  color?: string
}

function flattenResults(results: SearchResults): FlatResult[] {
  const flat: FlatResult[] = []

  for (const c of results.clients) {
    flat.push({
      id: `client-${c.id}`,
      label: c.name,
      sublabel: c.category,
      href: `/clients/${c.id}`,
      icon: <Users size={14} />,
      color: c.color ?? undefined,
    })
  }
  for (const f of results.files) {
    flat.push({
      id: `file-${f.id}`,
      label: f.filename,
      sublabel: f.description ?? 'Bestand',
      href: `/clients/${f.client_id}`,
      icon: <FileText size={14} />,
    })
  }
  for (const m of results.meetings) {
    flat.push({
      id: `meeting-${m.id}`,
      label: m.title,
      sublabel: 'Vergadering',
      href: `/clients/${m.client_id}/meetings/${m.id}`,
      icon: <Mic size={14} />,
    })
  }
  for (const d of results.documents) {
    flat.push({
      id: `doc-${d.id}`,
      label: d.title,
      sublabel: 'Expert document',
      href: `/clients/${d.client_id}/expert`,
      icon: <BookOpen size={14} />,
    })
  }
  for (const p of results.projects) {
    flat.push({
      id: `project-${p.id}`,
      label: p.name,
      sublabel: p.status,
      href: `/projects`,
      icon: <KanbanSquare size={14} />,
    })
  }

  return flat
}

export default function SearchModal() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FlatResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setActiveIdx(0)
    }
  }, [open])

  // Search with debounce
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setLoading(false); setSearchError(false); return }
    setLoading(true)
    setSearchError(false)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setResults(flattenResults(json.results))
        setActiveIdx(0)
      } catch (err) {
        console.error('Zoeken mislukt:', err)
        setResults([])
        setSearchError(true)
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    search(e.target.value)
  }

  function navigate(href: string) {
    setOpen(false)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[activeIdx]) navigate(results[activeIdx].href)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Zoek klanten, bestanden, vergaderingen…"
            className="flex-1 bg-transparent text-sh-grey text-sm outline-none placeholder:text-zinc-600"
          />
          {loading && (
            <span className="text-xs text-zinc-600 animate-pulse">Zoeken…</span>
          )}
          <button onClick={() => setOpen(false)}>
            <X size={14} className="text-zinc-600 hover:text-zinc-400" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIdx
                      ? 'bg-zinc-800 text-sh-grey'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-sh-grey'
                  }`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => navigate(r.href)}
                >
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: r.color ? `${r.color}22` : '#27272a', color: r.color ?? '#71717a' }}
                  >
                    {r.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{r.label}</span>
                    {r.sublabel && (
                      <span className="block text-xs text-zinc-600 capitalize">{r.sublabel}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.length >= 2 && !loading && searchError && (
          <p className="px-4 py-6 text-center text-sm text-zinc-600">
            Zoeken mislukt. Probeer het opnieuw.
          </p>
        )}

        {query.length >= 2 && !loading && !searchError && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-600">
            Geen resultaten voor &ldquo;{query}&rdquo;
          </p>
        )}

        {query.length < 2 && (
          <p className="px-4 py-5 text-center text-xs text-zinc-700">
            Typ minimaal 2 tekens om te zoeken
          </p>
        )}
      </div>
    </div>
  )
}
