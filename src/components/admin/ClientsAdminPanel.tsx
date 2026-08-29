'use client'

import { useState, useEffect, useMemo } from 'react'
import { Building2, Plus, Search, Pencil, Trash2, Loader2, X, Check, AlertTriangle } from 'lucide-react'

interface AdminClient {
  id: string
  name: string
  category: string
  color: string | null
  logo_url: string | null
  description: string | null
  created_at: string
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'klant',  label: 'Klant' },
  { value: 'atleet', label: 'Atleet' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'intern', label: 'Intern' },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const COLOR_PALETTE = [
  '#3b82f6', '#3A913F', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#14b8a6', '#71717a',
]

interface FormState {
  name: string
  category: string
  color: string
  logo_url: string
  description: string
}

const EMPTY_FORM: FormState = { name: '', category: 'klant', color: COLOR_PALETTE[0], logo_url: '', description: '' }

function ClientFormModal({ initial, onClose, onSaved }: {
  initial: AdminClient | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          category: initial.category,
          color: initial.color ?? COLOR_PALETTE[0],
          logo_url: initial.logo_url ?? '',
          description: initial.description ?? '',
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Naam is verplicht.'); return }
    setSaving(true)
    setError(null)
    const url = initial ? `/api/admin/clients/${initial.id}` : '/api/admin/clients'
    const method = initial ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      setError(await res.text())
      setSaving(false)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <form
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-100">
            {initial ? 'Klant bewerken' : 'Nieuwe klant'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Sluiten">
            <X size={14} className="text-zinc-600 hover:text-zinc-400" />
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Naam *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Sporthouse"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Categorie</label>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Kleur</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setForm(f => ({ ...f, color: c }))}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform"
                style={{ backgroundColor: c, transform: form.color === c ? 'scale(1.15)' : 'scale(1)' }}
              >
                {form.color === c && <Check size={13} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Logo URL</label>
          <input
            type="text"
            value={form.logo_url}
            onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
            placeholder="https://…"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Beschrijving</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#3A913F' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {initial ? 'Opslaan' : 'Aanmaken'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
          >
            Annuleren
          </button>
        </div>
      </form>
    </div>
  )
}

function DeleteClientModal({ client, onClose, onDeleted }: {
  client: AdminClient
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = confirmText === client.name

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDelete() {
    if (!matches) return
    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/admin/clients/${client.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: confirmText }),
    })
    if (!res.ok) {
      setError(await res.text())
      setDeleting(false)
      return
    }
    onDeleted()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-zinc-900 border border-red-900/40 rounded-xl shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-950/50 border border-red-900/50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">Klant definitief verwijderen</h3>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Dit verwijdert <b className="text-zinc-200">{client.name}</b> en alles wat eraan gekoppeld is —
          documenten, bestanden, vergaderingen, chatgeschiedenis, favorieten en meer — permanent en zonder
          herstelmogelijkheid.
        </p>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Typ <b className="text-zinc-300">{client.name}</b> om te bevestigen
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-red-700 transition-colors"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Definitief verwijderen
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientsAdminPanel() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdminClient | null>(null)
  const [deleting, setDeleting] = useState<AdminClient | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/clients')
    if (res.ok) setClients(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter(c => c.name.toLowerCase().includes(q) || CATEGORY_LABEL[c.category]?.toLowerCase().includes(q))
  }, [clients, search])

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col p-6 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Building2 size={15} className="text-zinc-500" />
              <h1 className="text-lg font-semibold text-zinc-100">Klantenbeheer</h1>
            </div>
            <p className="text-sm text-zinc-500">{clients.length} {clients.length === 1 ? 'klant' : 'klanten'}</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            <Plus size={14} />
            Nieuwe klant
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4 flex-shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam of categorie…"
            className="w-full pl-8 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Zoekopdracht wissen" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={12} /></button>
          )}
        </div>

        {/* List */}
        <div className="border border-zinc-800 rounded-xl flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-500">Geen klanten gevonden.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map(client => (
                <div key={client.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-zinc-900/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: client.color ?? '#3b82f6' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{client.name}</p>
                    <p className="text-xs text-zinc-600">{CATEGORY_LABEL[client.category] ?? client.category}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditing(client); setShowForm(true) }}
                      aria-label="Bewerken"
                      className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleting(client)}
                      aria-label="Verwijderen"
                      className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ClientFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {deleting && (
        <DeleteClientModal
          client={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={load}
        />
      )}
    </div>
  )
}
