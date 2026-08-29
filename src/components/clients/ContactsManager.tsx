'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Loader2, Mail, Phone, X, Check, User } from 'lucide-react'

interface Contact {
  id: string
  client_id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
}

function avatarColor(name: string) {
  const colors = ['#3A913F', '#0284c7', '#7c3aed', '#e11d48', '#d97706', '#0f766e', '#a21caf', '#1d4ed8']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

interface FormState {
  name: string
  role: string
  email: string
  phone: string
}

const EMPTY_FORM: FormState = { name: '', role: '', email: '', phone: '' }

function ContactModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Contact
  onSave: (data: FormState) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { name: initial.name, role: initial.role ?? '', email: initial.email ?? '', phone: initial.phone ?? '' }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Naam is verplicht.'); return }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan.')
    }
    setSaving(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-sh-grey">
            {initial ? 'Contact bewerken' : 'Nieuw contact'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Sluiten">
            <X size={14} className="text-zinc-600 hover:text-zinc-400" />
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {[
          { key: 'name', label: 'Naam *', placeholder: 'Jan Janssen', type: 'text' },
          { key: 'role', label: 'Functie', placeholder: 'Content Manager', type: 'text' },
          { key: 'email', label: 'E-mail', placeholder: 'jan@sporthouse.be', type: 'email' },
          { key: 'phone', label: 'Telefoon', placeholder: '+32 470 00 00 00', type: 'tel' },
        ].map(field => (
          <div key={field.key}>
            <label className="block text-xs text-zinc-500 mb-1">{field.label}</label>
            <input
              type={field.type}
              placeholder={field.placeholder}
              value={form[field.key as keyof FormState]}
              onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#3A913F' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {initial ? 'Opslaan' : 'Toevoegen'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-sh-grey bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
          >
            Annuleren
          </button>
        </div>
      </form>
    </div>
  )
}

export default function ContactsManager({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function load() {
    const res = await fetch(`/api/contacts?clientId=${clientId}`)
    const data = await res.json()
    setContacts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  async function handleAdd(form: FormState) {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, ...form }),
    })
    if (!res.ok) throw new Error('Toevoegen mislukt.')
    await load()
  }

  async function handleEdit(form: FormState) {
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing!.id, ...form }),
    })
    if (!res.ok) throw new Error('Opslaan mislukt.')
    await load()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' })
    await load()
    setDeletingId(null)
  }

  const filtered = contacts.filter(c =>
    `${c.name} ${c.role ?? ''} ${c.email ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Zoek op naam, functie of e-mail…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
        />
        <button
          onClick={() => { setEditing(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg flex-shrink-0 transition-colors"
          style={{ backgroundColor: '#3A913F' }}
        >
          <Plus size={14} />
          Toevoegen
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-zinc-800 rounded-xl">
          <User size={28} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {search ? 'Geen resultaten.' : 'Nog geen contacten toegevoegd.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(contact => {
            const color = avatarColor(contact.name)
            return (
              <div
                key={contact.id}
                className="group flex items-start gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all"
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials(contact.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sh-grey truncate">{contact.name}</p>
                  {contact.role && (
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{contact.role}</p>
                  )}
                  <div className="mt-2 space-y-1">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-sh-grey transition-colors group/link"
                      >
                        <Mail size={11} className="flex-shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-sh-grey transition-colors"
                      >
                        <Phone size={11} className="flex-shrink-0" />
                        <span>{contact.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(contact); setShowModal(true) }}
                    aria-label="Bewerken"
                    className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(contact.id)}
                    disabled={deletingId === contact.id}
                    aria-label="Verwijder contact"
                    className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    {deletingId === contact.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ContactModal
          initial={editing ?? undefined}
          onSave={editing ? handleEdit : handleAdd}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
