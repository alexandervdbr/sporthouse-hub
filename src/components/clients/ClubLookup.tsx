'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Upload, Search } from 'lucide-react'

interface Club {
  id: string
  full_name: string
  short_name: string
  competition: string
  level: string
  country: string
  sofascore_id: string
  needs_name: boolean
  updated_at: string
}

interface Competition {
  id: string
  name: string
  country: string
}


const COUNTRY_FLAGS: Record<string, string> = {
  'België': '🇧🇪', 'Belgium': '🇧🇪',
  'Nederland': '🇳🇱', 'Netherlands': '🇳🇱',
  'Duitsland': '🇩🇪', 'Germany': '🇩🇪',
  'Frankrijk': '🇫🇷', 'France': '🇫🇷',
  'Spanje': '🇪🇸', 'Spain': '🇪🇸',
  'Italië': '🇮🇹', 'Italy': '🇮🇹',
  'Engeland': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Portugal': '🇵🇹', 'Schotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Turkije': '🇹🇷', 'Turkey': '🇹🇷',
  'USA': '🇺🇸', 'Brazilië': '🇧🇷', 'Brazil': '🇧🇷',
  'Argentinië': '🇦🇷', 'Argentina': '🇦🇷',
}

function flag(country: string) {
  return COUNTRY_FLAGS[country] ?? '🌍'
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-yellow-400/20 text-yellow-300 rounded-sm px-0.5">{p}</mark>
      : p
  )
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function ClubLookup({
  clientId,
  isAdmin,
}: {
  clientId: string
  isAdmin: boolean
}) {
  const [activeTab, setActiveTab] = useState<'clubs' | 'beheer'>('clubs')
  const [clubs, setClubs] = useState<Club[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)

  // Clubs tab
  const [searchQ, setSearchQ] = useState('')
  const [activeComp, setActiveComp] = useState<string | null>(null)
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Club>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Add panel
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', short_name: '', competition: '', level: '', country: '', sofascore_id: '' })
  const [addingSaving, setAddingSaving] = useState(false)

  // Beheer tab
  const [newComp, setNewComp] = useState({ name: '', country: '' })
  const [addingComp, setAddingComp] = useState(false)
  const [deletingCompId, setDeletingCompId] = useState<string | null>(null)

  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ inserted: number; updated: number; skipped: number; competitionsAdded: number } | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cRes, compRes] = await Promise.all([
          fetch(`/api/club-lookup/clubs?clientId=${clientId}`),
          fetch(`/api/club-lookup/competitions?clientId=${clientId}`),
        ])
        if (cRes.ok) setClubs(await cRes.json())
        if (compRes.ok) setCompetitions(await compRes.json())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setSelectedClub(null)
        setEditingId(null)
        setShowAdd(false)
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredClubs = clubs
    .filter(c => {
      if (activeComp && c.competition !== activeComp) return false
      if (!searchQ.trim()) return true
      const q = searchQ.toLowerCase()
      return [c.full_name, c.short_name, c.competition, c.country]
        .join(' ').toLowerCase()
        .includes(q)
    })
    .sort((a, b) => {
      if (!searchQ.trim()) return 0
      const q = searchQ.toLowerCase()
      const aShort = a.short_name.toLowerCase().startsWith(q)
      const bShort = b.short_name.toLowerCase().startsWith(q)
      if (aShort !== bShort) return bShort ? 1 : -1
      return a.full_name.localeCompare(b.full_name)
    })

  const uniqueCompetitions = [...new Set(clubs.map(c => c.competition).filter(Boolean))].sort()
  const needsNameCount = clubs.filter(c => c.needs_name).length
  const lastUpdated = clubs.length
    ? formatDate(clubs.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at)
    : null

  // ── Copy ───────────────────────────────────────────────────────────────────
  async function copyShortName(club: Club) {
    await navigator.clipboard.writeText(club.short_name).catch(() => {})
    setCopied(club.id)
    setTimeout(() => setCopied(null), 1000)
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function startEdit(club: Club) {
    setEditingId(club.id)
    setEditForm({ ...club })
    setSelectedClub(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSavingEdit(true)
    try {
      const res = await fetch('/api/club-lookup/clubs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm, needs_name: false }),
      })
      if (res.ok) {
        const updated = await res.json()
        setClubs(prev => prev.map(c => c.id === editingId ? updated : c))
        setEditingId(null)
      }
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteClub(id: string) {
    if (!confirm('Club verwijderen?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/club-lookup/clubs?id=${id}`, { method: 'DELETE' })
      setClubs(prev => prev.filter(c => c.id !== id))
      if (selectedClub?.id === id) setSelectedClub(null)
    } finally {
      setDeletingId(null)
    }
  }

  // ── Add club ───────────────────────────────────────────────────────────────
  async function saveAdd() {
    if (!addForm.full_name.trim() || !addForm.short_name.trim()) return
    setAddingSaving(true)
    try {
      const res = await fetch('/api/club-lookup/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...addForm }),
      })
      if (res.ok) {
        const newClub = await res.json()
        setClubs(prev => [...prev, newClub])
        setAddForm({ full_name: '', short_name: '', competition: '', level: '', country: '', sofascore_id: '' })
        setShowAdd(false)
      }
    } finally {
      setAddingSaving(false)
    }
  }

  // ── Competitions ───────────────────────────────────────────────────────────
  async function addCompetition() {
    if (!newComp.name) return
    setAddingComp(true)
    try {
      const res = await fetch('/api/club-lookup/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name: newComp.name, country: newComp.country }),
      })
      if (res.ok) {
        const c = await res.json()
        setCompetitions(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
        setNewComp({ name: '', country: '' })
      }
    } finally {
      setAddingComp(false)
    }
  }

  async function deleteCompetition(id: string) {
    setDeletingCompId(id)
    try {
      await fetch(`/api/club-lookup/competitions?id=${id}`, { method: 'DELETE' })
      setCompetitions(prev => prev.filter(c => c.id !== id))
    } finally {
      setDeletingCompId(null)
    }
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCsvImporting(true)
    setCsvResult(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/club-lookup/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, csv: text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = typeof data === 'string' ? data : (data?.error ?? data?.message ?? 'CSV import mislukt')
        alert(msg)
        return
      }
      setCsvResult(data)
      const [clubsRes, compsRes] = await Promise.all([
        fetch(`/api/club-lookup/clubs?clientId=${clientId}`),
        fetch(`/api/club-lookup/competitions?clientId=${clientId}`),
      ])
      if (clubsRes.ok) setClubs(await clubsRes.json())
      if (compsRes.ok) setCompetitions(await compsRes.json())
    } finally {
      setCsvImporting(false)
    }
  }

  // ── Related clubs ──────────────────────────────────────────────────────────
  const relatedClubs = selectedClub
    ? clubs.filter(c => c.competition === selectedClub.competition && c.id !== selectedClub.id).slice(0, 12)
    : []

  const tabs: { key: 'clubs' | 'beheer'; label: string }[] = [
    { key: 'clubs', label: 'Clubs' },
    ...(isAdmin ? [{ key: 'beheer' as const, label: 'Beheer' }] : []),
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-zinc-600" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4 border-b border-zinc-900">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
                {tab.key === 'clubs' && needsNameCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-orange-500/20 text-orange-400 rounded-full">{needsNameCount}</span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'clubs' && (
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Zoek club, competitie, land… (⌘K)"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 pl-9 pr-4 py-2 outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
              {isAdmin && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white text-zinc-900 rounded-xl text-sm font-semibold hover:bg-zinc-100 transition-colors whitespace-nowrap"
                >
                  <Plus size={14} /> Club toevoegen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Competition filters */}
        {activeTab === 'clubs' && uniqueCompetitions.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => setActiveComp(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                !activeComp ? 'bg-white text-zinc-900 border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              Alle
            </button>
            {uniqueCompetitions.map(comp => (
              <button
                key={comp}
                onClick={() => setActiveComp(activeComp === comp ? null : comp)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  activeComp === comp ? 'bg-white text-zinc-900 border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                {comp}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-600 font-mono">
              {filteredClubs.length} / {clubs.length} clubs
              {lastUpdated && <> · bijgewerkt {lastUpdated}</>}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Clubs tab ── */}
        {activeTab === 'clubs' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {filteredClubs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-zinc-500 text-sm">
                    {clubs.length === 0 ? 'Nog geen clubs. Importeer een CSV of voeg clubs manueel toe via Beheer.' : 'Geen clubs gevonden.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {filteredClubs.map(club => (
                    <Fragment key={club.id}>
                      {editingId === club.id ? (
                        /* ── Edit card ── */
                        <div className="bg-zinc-800 border border-zinc-600 rounded-xl p-3 flex flex-col gap-2">
                          <input
                            value={editForm.full_name ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                            placeholder="Volledige naam"
                            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-zinc-500"
                          />
                          <input
                            value={editForm.short_name ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, short_name: e.target.value }))}
                            placeholder="Interne naam"
                            className="w-full bg-zinc-900 border border-zinc-600 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:border-zinc-400 font-medium"
                          />
                          <input
                            value={editForm.competition ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, competition: e.target.value }))}
                            placeholder="Competitie"
                            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-zinc-500"
                          />
                          <div className="flex gap-1.5">
                            <input
                              value={editForm.country ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))}
                              placeholder="Land"
                              className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-zinc-500"
                            />
                            <input
                              value={editForm.sofascore_id ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, sofascore_id: e.target.value }))}
                              placeholder="Sofascore ID"
                              className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-zinc-500 font-mono"
                            />
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            <button
                              onClick={saveEdit}
                              disabled={savingEdit}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                            >
                              {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Opslaan
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium hover:bg-zinc-600 transition-colors"
                            >
                              <X size={11} /> Annuleer
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Club card ── */
                        <div
                          className={`group relative bg-zinc-900 border rounded-xl p-3 cursor-pointer transition-all ${
                            copied === club.id
                              ? 'border-green-500/60 bg-green-500/5'
                              : selectedClub?.id === club.id
                              ? 'border-zinc-500 bg-zinc-800/60'
                              : club.needs_name
                              ? 'border-orange-500/30 hover:border-orange-400/50'
                              : 'border-zinc-800 hover:border-zinc-600'
                          }`}
                          onClick={() => { copyShortName(club); setSelectedClub(club) }}
                        >
                          {club.needs_name && (
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-orange-400" title="Naam vereist" />
                          )}
                          <p className="text-xs text-zinc-500 font-mono truncate mb-1">
                            {flag(club.country)} {highlight(club.competition, searchQ)}
                          </p>
                          <p className="text-sm font-medium text-zinc-200 leading-tight mb-1 pr-4">
                            {highlight(club.full_name, searchQ)}
                          </p>
                          <p className={`text-sm font-semibold transition-colors ${copied === club.id ? 'text-green-400' : 'text-white'}`}>
                            {highlight(club.short_name, searchQ)}
                          </p>
                          <p className="text-xs text-zinc-600 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {copied === club.id ? '✓ gekopieerd' : 'klik om te kopiëren'}
                          </p>

                          {isAdmin && (
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={e => { e.stopPropagation(); startEdit(club) }}
                                className="w-6 h-6 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); deleteClub(club.id) }}
                                disabled={deletingId === club.id}
                                className="w-6 h-6 rounded-md bg-zinc-800 hover:bg-red-500/20 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors"
                              >
                                {deletingId === club.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* ── Detail panel ── */}
            {selectedClub && (
              <div className="w-72 flex-shrink-0 border-l border-zinc-800 bg-zinc-900/50 flex flex-col overflow-y-auto">
                <div className="p-5 border-b border-zinc-800 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-500 font-mono mb-1">
                      {flag(selectedClub.country)} {selectedClub.competition}
                    </p>
                    <p className="text-base font-semibold text-white leading-tight">{selectedClub.full_name}</p>
                    <p className="text-sm text-zinc-400 mt-0.5">{selectedClub.short_name}</p>
                  </div>
                  <button onClick={() => setSelectedClub(null)} className="text-zinc-600 hover:text-zinc-300 mt-0.5 flex-shrink-0">
                    <X size={15} />
                  </button>
                </div>

                <div className="p-5 flex flex-col gap-3">
                  <p className="text-xs text-zinc-600 uppercase tracking-wide font-mono">Namen kopiëren</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedClub.short_name).catch(() => {}) }}
                    className="flex items-center justify-between px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors group"
                  >
                    <div className="text-left">
                      <p className="text-xs text-zinc-500">Interne naam</p>
                      <p className="text-sm font-semibold text-white">{selectedClub.short_name}</p>
                    </div>
                    <span className="text-xs text-zinc-600 group-hover:text-zinc-400">klik</span>
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedClub.full_name).catch(() => {}) }}
                    className="flex items-center justify-between px-3 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
                  >
                    <div className="text-left">
                      <p className="text-xs text-zinc-500">Volledige naam</p>
                      <p className="text-sm text-zinc-300">{selectedClub.full_name}</p>
                    </div>
                    <span className="text-xs text-zinc-600 group-hover:text-zinc-400">klik</span>
                  </button>
                </div>

                {relatedClubs.length > 0 && (
                  <div className="px-5 pb-5 flex flex-col gap-2">
                    <p className="text-xs text-zinc-600 uppercase tracking-wide font-mono">Zelfde competitie</p>
                    {relatedClubs.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { copyShortName(r); setSelectedClub(r) }}
                        className="flex items-center justify-between px-3 py-2 bg-zinc-800/40 hover:bg-zinc-800 rounded-lg transition-colors text-left"
                      >
                        <span className="text-sm text-zinc-300 truncate">{r.full_name}</span>
                        <span className="text-xs text-zinc-500 font-mono ml-2 flex-shrink-0">{r.short_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Beheer tab ── */}
        {activeTab === 'beheer' && isAdmin && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl mx-auto space-y-10">

              {/* Add club panel (inside beheer for mobile fallback too) */}
              {showAdd && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Club toevoegen</h3>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Volledige naam *" className="col-span-2 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                    <input value={addForm.short_name} onChange={e => setAddForm(f => ({ ...f, short_name: e.target.value }))} placeholder="Interne naam *" className="col-span-2 bg-zinc-800 border border-zinc-600 text-white text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-400 placeholder:text-zinc-600 font-medium" />
                    <input value={addForm.competition} onChange={e => setAddForm(f => ({ ...f, competition: e.target.value }))} placeholder="Competitie" className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                    <input value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} placeholder="Land" className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={saveAdd} disabled={addingSaving || !addForm.full_name || !addForm.short_name} className="flex items-center gap-1.5 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {addingSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Opslaan
                    </button>
                    <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
                      Annuleer
                    </button>
                  </div>
                </div>
              )}

              {/* Competities */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-1">Competities</h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Worden automatisch gedetecteerd bij CSV import. Je kan ze ook manueel toevoegen of verwijderen.
                </p>

                {competitions.length === 0 && (
                  <p className="text-xs text-zinc-600 mb-4">Nog geen competities. Importeer een CSV — competities worden automatisch gedetecteerd.</p>
                )}

                {competitions.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
                    <div className="divide-y divide-zinc-800">
                      {competitions.map(comp => (
                        <div key={comp.id} className="flex items-center justify-between px-4 py-3">
                          <p className="text-sm text-zinc-200">{flag(comp.country)} {comp.name}</p>
                          <button onClick={() => deleteCompetition(comp.id)} disabled={deletingCompId === comp.id} className="text-zinc-600 hover:text-red-400 transition-colors ml-3">
                            {deletingCompId === comp.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input value={newComp.name} onChange={e => setNewComp(f => ({ ...f, name: e.target.value }))} placeholder="Competitie manueel toevoegen" className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                  <button onClick={addCompetition} disabled={addingComp || !newComp.name} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {addingComp ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Toevoegen
                  </button>
                </div>
              </div>

              {/* CSV import */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-1">CSV import</h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Verwachte kolommen: <span className="font-mono text-zinc-400">full_name, short_name, competition, level, country, sofascore_id</span><br />
                  Bestaande interne namen worden nooit overschreven — enkel competitie, land en niveau worden bijgewerkt.
                </p>
                <label className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-medium cursor-pointer transition-colors w-fit">
                  {csvImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {csvImporting ? 'Importeren…' : 'CSV uploaden'}
                  <input type="file" accept=".csv" className="hidden" onChange={handleCSV} disabled={csvImporting} />
                </label>
                {csvResult && (
                  <p className="mt-3 text-xs text-zinc-400 font-mono">
                    ✓ {csvResult.inserted} clubs toegevoegd · {csvResult.updated} bijgewerkt · {csvResult.skipped} overgeslagen
                    {csvResult.competitionsAdded > 0 && (
                      <><br />↳ {csvResult.competitionsAdded} {csvResult.competitionsAdded === 1 ? 'nieuwe competitie' : 'nieuwe competities'} gedetecteerd</>
                    )}
                  </p>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Add club slide panel (shown on top when in clubs tab) ── */}
      {showAdd && activeTab === 'clubs' && (
        <div className="absolute inset-0 z-50 flex items-start justify-end pointer-events-none">
          <div className="pointer-events-auto w-80 h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col p-6 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Club toevoegen</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-600 hover:text-zinc-300"><X size={15} /></button>
            </div>
            <div className="flex flex-col gap-2">
              <input value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Volledige naam *" className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
              <input value={addForm.short_name} onChange={e => setAddForm(f => ({ ...f, short_name: e.target.value }))} placeholder="Interne naam *" className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-400 placeholder:text-zinc-600 font-medium" />
              <input value={addForm.competition} onChange={e => setAddForm(f => ({ ...f, competition: e.target.value }))} placeholder="Competitie" className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
              <input value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} placeholder="Land" className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded-lg outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
            </div>
            <button onClick={saveAdd} disabled={addingSaving || !addForm.full_name || !addForm.short_name} className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {addingSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Opslaan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
