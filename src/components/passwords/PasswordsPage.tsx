'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Eye, EyeOff, Copy, Check, Pencil, Trash2, X, ExternalLink, Search, Lock, ArrowLeft } from 'lucide-react'

interface Credential {
  id: string
  platform: string
  url: string | null
  username: string
  password: string
  notes: string | null
  created_at: string
}

interface FormState {
  platform: string
  url: string
  username: string
  password: string
  notes: string
}

const EMPTY_FORM: FormState = { platform: '', url: '', username: '', password: '', notes: '' }

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded transition-colors text-zinc-500 hover:text-zinc-300"
      title="Kopiëren"
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  )
}

// ─── Credential card ──────────────────────────────────────────────────────────

function CredentialCard({
  cred,
  onEdit,
  onDelete,
}: {
  cred: Credential
  onEdit?: (c: Credential) => void
  onDelete?: (id: string) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const initials = cred.platform.slice(0, 2).toUpperCase()

  return (
    <div
      className="relative rounded-2xl p-5 flex flex-col gap-4 group"
      style={{
        background: 'rgba(22,22,22,0.98)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      {/* Top shine */}
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold text-zinc-300"
            style={{ background: 'rgba(58,145,63,0.15)', border: '1px solid rgba(58,145,63,0.25)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{cred.platform}</p>
            {cred.url && (
              <a
                href={cred.url.startsWith('http') ? cred.url : `https://${cred.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors truncate"
              >
                {cred.url.replace(/^https?:\/\//, '')}
                <ExternalLink size={10} className="flex-shrink-0" />
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(cred)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(cred.id)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-all"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-2.5">
        {/* Username */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Gebruikersnaam</p>
            <p className="text-sm text-zinc-300 truncate">{cred.username}</p>
          </div>
          <CopyButton value={cred.username} />
        </div>

        {/* Password */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Wachtwoord</p>
            <p className="text-sm text-zinc-300 font-mono truncate">
              {showPassword ? cred.password : '••••••••••••'}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowPassword(p => !p)}
              className="p-1 rounded transition-colors text-zinc-500 hover:text-zinc-300"
            >
              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <CopyButton value={cred.password} />
          </div>
        </div>

        {/* Notes */}
        {cred.notes && (
          <p className="text-xs text-zinc-500 leading-relaxed px-1">{cred.notes}</p>
        )}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  title,
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  title: string
  form: FormState
  saving: boolean
  onClose: () => void
  onChange: (f: FormState) => void
  onSave: () => void
}) {
  const inputClass = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
  const labelClass = "block text-xs text-zinc-500 mb-1.5"
  const [showPw, setShowPw] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Platform *</label>
            <input className={inputClass} placeholder="bv. Instagram, Facebook, Google…"
              value={form.platform} onChange={e => onChange({ ...form, platform: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>URL</label>
            <input className={inputClass} placeholder="bv. instagram.com"
              value={form.url} onChange={e => onChange({ ...form, url: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Gebruikersnaam / e-mail *</label>
            <input className={inputClass} placeholder="gebruikersnaam of e-mailadres"
              value={form.username} onChange={e => onChange({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Wachtwoord *</label>
            <div className="relative">
              <input
                className={inputClass + ' pr-9 font-mono'}
                type={showPw ? 'text' : 'password'}
                placeholder="wachtwoord"
                value={form.password}
                onChange={e => onChange({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>Notities</label>
            <textarea className={inputClass + ' resize-none'} rows={2} placeholder="Optionele notitie…"
              value={form.notes} onChange={e => onChange({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            Annuleren
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.platform || !form.username || !form.password}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#3A913F', color: '#fff' }}
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PasswordsPage({ canAdd, canDelete, allowedIds }: { canAdd: boolean; canDelete: boolean; allowedIds: string[] | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Credential | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let query = supabase.from('credentials').select('*').order('platform')
    if (allowedIds !== null) {
      query = allowedIds.length > 0
        ? query.in('id', allowedIds)
        : query.in('id', ['00000000-0000-0000-0000-000000000000']) // geen toegang
    }
    const { data } = await query
    setCredentials(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(cred: Credential) {
    setEditing(cred)
    setForm({ platform: cred.platform, url: cred.url ?? '', username: cred.username, password: cred.password, notes: cred.notes ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      platform: form.platform.trim(),
      url: form.url.trim() || null,
      username: form.username.trim(),
      password: form.password,
      notes: form.notes.trim() || null,
    }
    if (editing) {
      await supabase.from('credentials').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('credentials').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    await supabase.from('credentials').delete().eq('id', id)
    setDeleteId(null)
    load()
  }

  const filtered = credentials.filter(c =>
    c.platform.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 mb-6 text-sm text-zinc-500 hover:text-zinc-200 transition-colors">
        <ArrowLeft size={14} /> Terug
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Lock size={18} className="text-zinc-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-kurdis)' }}>
              Wachtwoorden
            </h1>
          </div>
          <p className="text-sm text-zinc-500">Gedeelde logins voor het team</p>
        </div>
        {canAdd && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0"
            style={{ background: '#3A913F', color: '#fff' }}
          >
            <Plus size={15} />
            Toevoegen
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Zoeken op platform of gebruikersnaam…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">Laden…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Lock size={28} className="text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">
            {search ? 'Geen resultaten gevonden.' : 'Nog geen wachtwoorden toegevoegd.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(cred => (
            <CredentialCard
              key={cred.id}
              cred={cred}
              onEdit={canAdd ? openEdit : undefined}
              onDelete={canDelete ? setDeleteId : undefined}
            />
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <Modal
          title={editing ? 'Wachtwoord bewerken' : 'Wachtwoord toevoegen'}
          form={form}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onChange={setForm}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative rounded-2xl p-6 shadow-2xl max-w-sm w-full"
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>
            <h2 className="text-base font-semibold text-white mb-2">Verwijderen?</h2>
            <p className="text-sm text-zinc-400 mb-6">Dit wachtwoord wordt permanent verwijderd.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Annuleren
              </button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors">
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
