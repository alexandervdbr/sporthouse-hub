'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, ChevronDown, Loader2, Check, Trash2, Clock, Zap, CheckCircle2, CalendarDays, User, Pencil, Search } from 'lucide-react'
import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string
  project_id: string
  name: string
  photo_url: string | null
  contact_id: string | null
}

interface Project {
  id: string
  client_id: string | null
  name: string
  description: string | null
  status: StatusValue
  color: string | null
  due_date: string | null
  created_by: string | null
  created_at: string
  client: { name: string; color: string } | null
  members: Member[]
}

interface ClientOption {
  id: string
  name: string
  color: string
  category: string
}

interface ContactOption {
  id: string
  name: string
  role: string | null
  photo_url: string | null
}

interface Props {
  initialProjects: Project[]
  clients: ClientOption[]
  contacts: ContactOption[]
  currentUserEmail: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS = [
  { value: 'finished' as const, label: 'Finished', icon: CheckCircle2,  color: '#3b82f6', bg: '#3b82f610', border: '#3b82f628' },
  { value: 'upcoming' as const, label: 'Upcoming', icon: Clock,         color: '#f59e0b', bg: '#f59e0b10', border: '#f59e0b28' },
  { value: 'ongoing'  as const, label: 'Ongoing',  icon: Zap,           color: '#3A913F', bg: '#3A913F10', border: '#3A913F28' },
]

type StatusValue = typeof COLUMNS[number]['value']

const COLOR_PALETTE = [
  { label: 'Groen',   value: '#3A913F' },
  { label: 'Blauw',   value: '#3b82f6' },
  { label: 'Paars',   value: '#8b5cf6' },
  { label: 'Roze',    value: '#ec4899' },
  { label: 'Rood',    value: '#ef4444' },
  { label: 'Oranje',  value: '#f97316' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Grijs',   value: '#71717a' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name: string) {
  const colors = ['#7c3aed', '#db2777', '#0891b2', '#d97706', '#059669', '#dc2626', '#2563eb']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function projectAccentColor(project: Project) {
  return project.color ?? project.client?.color ?? '#52525b'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoUrl, size = 26 }: { name: string; photoUrl: string | null; size?: number }) {
  if (photoUrl) {
    return (
      <Image src={photoUrl} alt={name} width={size} height={size}
        className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: avatarColor(name) }}>
      {getInitials(name)}
    </div>
  )
}

// ─── Contact Picker ───────────────────────────────────────────────────────────

function ContactPicker({ contacts, selected, onChange }: {
  contacts: ContactOption[]
  selected: ContactOption[]
  onChange: (c: ContactOption[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.role ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function toggle(contact: ContactOption) {
    if (selected.find(s => s.id === contact.id)) onChange(selected.filter(s => s.id !== contact.id))
    else onChange([...selected, contact])
  }

  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1.5">Teamleden</label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-zinc-800 border border-zinc-700 rounded-full">
              <Avatar name={c.name} photoUrl={c.photo_url} size={18} />
              <span className="text-xs text-zinc-300">{c.name.split(' ')[0]}</span>
              <button type="button" onClick={() => onChange(selected.filter(s => s.id !== c.id))} className="text-zinc-600 hover:text-zinc-300">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors">
        <Plus size={12} />
        {selected.length === 0 ? 'Teamlid toevoegen' : 'Meer toevoegen'}
      </button>
      {open && (
        <div className="mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-zinc-800">
            <input autoFocus type="text" placeholder="Zoeken…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-sh-grey placeholder:text-zinc-600 focus:outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0
              ? <p className="text-xs text-zinc-600 text-center py-4">Geen contacten gevonden</p>
              : filtered.map(c => {
                const isSelected = !!selected.find(s => s.id === c.id)
                return (
                  <button key={c.id} type="button" onClick={() => toggle(c)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800 transition-colors text-left ${isSelected ? 'bg-zinc-800/60' : ''}`}>
                    <Avatar name={c.name} photoUrl={c.photo_url} size={26} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-300 truncate">{c.name}</p>
                      {c.role && <p className="text-[10px] text-zinc-600 truncate">{c.role}</p>}
                    </div>
                    {isSelected && <Check size={12} style={{ color: '#3A913F' }} className="flex-shrink-0" />}
                  </button>
                )
              })
            }
          </div>
          <div className="p-2 border-t border-zinc-800">
            <button type="button" onClick={() => { setOpen(false); setSearch('') }}
              className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1 transition-colors">Sluiten</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, clientColor, onChange }: {
  value: string | null
  clientColor: string | null
  onChange: (color: string | null) => void
}) {
  const palette = clientColor
    ? [{ label: 'Klantkleur', value: null as string | null }, ...COLOR_PALETTE]
    : COLOR_PALETTE

  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-2">Kleur</label>
      <div className="flex items-center gap-2 flex-wrap">
        {palette.map((c) => {
          const displayColor = c.value ?? clientColor ?? '#52525b'
          const isActive = c.value === null ? value === null : value === c.value
          return (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onClick={() => onChange(c.value)}
              className="w-6 h-6 rounded-full transition-all flex-shrink-0"
              style={{
                backgroundColor: displayColor,
                boxShadow: isActive ? `0 0 0 2px #18181b, 0 0 0 4px ${displayColor}` : 'none',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Project Detail Modal ─────────────────────────────────────────────────────

function ProjectDetailModal({ project, contacts, onClose, onUpdate, onDelete }: {
  project: Project
  contacts: ContactOption[]
  onClose: () => void
  onUpdate: (updated: Project) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<StatusValue>(project.status)
  const [color, setColor] = useState<string | null>(project.color)
  const [description, setDescription] = useState(project.description ?? '')
  const [members, setMembers] = useState<ContactOption[]>(
    project.members.map(m => ({
      id: m.contact_id ?? m.id,
      name: m.name,
      role: null,
      photo_url: m.photo_url,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()
  const accentColor = color ?? project.client?.color ?? '#52525b'

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('projects')
      .update({ status, color, description: description.trim() || null })
      .eq('id', project.id)

    if (!error) {
      await supabase.from('project_members').delete().eq('project_id', project.id)
      if (members.length > 0) {
        await supabase.from('project_members').insert(
          members.map(m => ({
            project_id: project.id,
            name: m.name,
            contact_id: m.id,
            photo_url: m.photo_url ?? null,
          }))
        )
      }
      onUpdate({
        ...project,
        status,
        color,
        description: description.trim() || null,
        members: members.map((m, i) => ({
          id: String(i),
          project_id: project.id,
          name: m.name,
          contact_id: m.id,
          photo_url: m.photo_url ?? null,
        })),
      })
    }
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('projects').delete().eq('id', project.id)
    onDelete(project.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-lg overflow-hidden animate-scale-in glass" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>

        {/* Accent bar */}
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-base font-semibold text-zinc-100 leading-snug">{project.name}</p>
            {project.client && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.client.color }} />
                <span className="text-xs text-zinc-500">{project.client.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setEditing(e => !e)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                editing
                  ? 'bg-zinc-800 text-zinc-300'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Pencil size={11} />
              Bewerken
            </button>
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── View mode ─────────────────────────────────── */}
        {!editing && (
          <div className="px-5 pb-5 space-y-5 max-h-[65vh] overflow-y-auto">
            {description ? (
              <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
            ) : (
              <p className="text-sm text-zinc-600 italic">Geen omschrijving.</p>
            )}

            {members.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-3">Teamleden</p>
                <div className="flex flex-col gap-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar name={m.name} photoUrl={m.photo_url} size={30} />
                      <span className="text-sm text-zinc-300">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Edit mode ─────────────────────────────────── */}
        {editing && (
          <>
            <div className="px-5 pb-5 space-y-5 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Omschrijving</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Voeg een omschrijving toe..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-2">Status</label>
                <div className="flex gap-2">
                  {COLUMNS.map(c => (
                    <button key={c.value} type="button" onClick={() => setStatus(c.value)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all"
                      style={status === c.value
                        ? { color: c.color, backgroundColor: c.bg, borderColor: c.border }
                        : { color: '#52525b', backgroundColor: 'transparent', borderColor: '#202020' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: status === c.value ? c.color : '#52525b' }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <ColorPicker value={color} clientColor={project.client?.color ?? null} onChange={setColor} />

              <ContactPicker contacts={contacts} selected={members} onChange={setMembers} />

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <CalendarDays size={11} />
                  <span>Aangemaakt op {new Date(project.created_at).toLocaleDateString('nl-BE', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}</span>
                </div>
                {project.created_by && (
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    <User size={11} />
                    <span>{project.created_by}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-zinc-800">
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors">
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Verwijder project
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Annuleren
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: '#3A913F' }}>
                  {saving ? <><Loader2 size={13} className="animate-spin" /> Opslaan...</> : 'Opslaan'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick, onStatusChange }: {
  project: Project
  onClick: () => void
  onStatusChange: (id: string, status: StatusValue) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const accentColor = projectAccentColor(project)

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl cursor-pointer transition-all duration-200"
      style={{
        background: 'rgba(22,22,22,0.95)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}22`
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      <div className="p-3.5">
        {/* Client badge */}
        {project.client && (
          <div className="mb-2.5">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${accentColor}18`,
                color: accentColor,
                border: `1px solid ${accentColor}30`,
              }}
            >
              {project.client.name}
            </span>
          </div>
        )}

        {/* Project name */}
        <p className="text-[13.5px] font-semibold text-zinc-100 leading-snug mb-2">{project.name}</p>

        {/* Bottom row */}
        <div className="flex items-center justify-between gap-2 mt-2.5">
          {project.members.length > 0 ? (
            <div className="flex items-center">
              {project.members.slice(0, 5).map((m, i) => (
                <div key={m.id} title={m.name} className="ring-[1.5px] ring-zinc-900 rounded-full"
                  style={{ marginLeft: i > 0 ? '-6px' : '0' }}>
                  <Avatar name={m.name} photoUrl={m.photo_url} size={22} />
                </div>
              ))}
              {project.members.length > 5 && (
                <div className="w-[22px] h-[22px] rounded-full bg-zinc-800 ring-[1.5px] ring-zinc-900 flex items-center justify-center text-[9px] font-medium text-zinc-400"
                  style={{ marginLeft: '-6px' }}>
                  +{project.members.length - 5}
                </div>
              )}
            </div>
          ) : <div />}

          {/* Status quick-change */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className="p-1 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-zinc-800/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronDown size={11} />
            </button>
            {showMenu && (
              <div className="absolute z-50 bottom-full mb-1 right-0 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl py-1 min-w-[140px]">
                {COLUMNS.map(col => (
                  <button key={col.value}
                    onClick={() => { onStatusChange(project.id, col.value); setShowMenu(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors ${project.status === col.value ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                    {col.label}
                    {project.status === col.value && <Check size={10} className="ml-auto" style={{ color: col.color }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({ clients, contacts, defaultStatus, onClose, onSave }: {
  clients: ClientOption[]
  contacts: ContactOption[]
  defaultStatus: StatusValue
  currentUserEmail: string | null
  onClose: () => void
  onSave: (project: Project) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<StatusValue>(defaultStatus)
  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({ name: name.trim(), description: description.trim() || null, client_id: clientId || null, status, created_by: user?.email })
        .select('*, client:clients(name, color)')
        .single()

      if (projectError) throw new Error(projectError.message)
      if (!project) throw new Error('Project aanmaken mislukt.')

      if (selectedContacts.length > 0) {
        const { error: membersError } = await supabase.from('project_members').insert(
          selectedContacts.map(c => ({
            project_id: project.id, name: c.name, contact_id: c.id, photo_url: c.photo_url ?? null,
          }))
        )
        if (membersError) throw new Error('Teamleden opslaan mislukt: ' + membersError.message)
      }

      onSave({
        ...project,
        color: null,
        description: description.trim() || null,
        members: selectedContacts.map((c, i) => ({
          id: String(i), project_id: project.id, name: c.name, contact_id: c.id, photo_url: c.photo_url ?? null,
        })),
      } as Project)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Er is een fout opgetreden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-md animate-scale-in glass" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-semibold text-sh-grey">Nieuw project</p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {saveError && (
            <div className="px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
              <p className="text-xs text-red-400">{saveError}</p>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Projectnaam *</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="bv. Social Media Q2 2026"
              className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors" />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">
              Omschrijving <span className="text-zinc-700">— optioneel</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Korte omschrijving van het project..."
              rows={3}
              className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-sh-grey placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Klant</label>
            <div className="relative">
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-sh-grey focus:outline-none focus:border-zinc-700 transition-colors pr-8">
                <option value="">Geen specifieke klant</option>
                {(['intern', 'klant', 'atleet', 'podcast'] as const).map(key => {
                  const group = clients.filter(c => c.category === key)
                  if (!group.length) return null
                  const label = { intern: 'Intern', klant: 'Klanten', atleet: 'Atleten', podcast: 'FOS — Podcasts' }[key]
                  return (
                    <optgroup key={key} label={label}>
                      {group.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )
                })}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Status</label>
            <div className="flex gap-2">
              {COLUMNS.map(col => (
                <button key={col.value} type="button" onClick={() => setStatus(col.value)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all"
                  style={status === col.value
                    ? { color: col.color, backgroundColor: col.bg, borderColor: col.border }
                    : { color: '#52525b', backgroundColor: 'transparent', borderColor: '#202020' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: status === col.value ? col.color : '#52525b' }} />
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <ContactPicker contacts={contacts} selected={selectedContacts} onChange={setSelectedContacts} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Annuleren</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            {saving ? <><Loader2 size={13} className="animate-spin" /> Opslaan...</> : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ column, projects, onAdd, onProjectClick, onStatusChange }: {
  column: typeof COLUMNS[number]
  projects: Project[]
  onAdd: () => void
  onProjectClick: (project: Project) => void
  onStatusChange: (id: string, status: StatusValue) => void
}) {
  const Icon = column.icon
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl mb-3"
        style={{
          background: `linear-gradient(135deg, ${column.color}0e 0%, ${column.color}05 100%)`,
          border: `1px solid ${column.border}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${column.color}20`, border: `1px solid ${column.color}35` }}
          >
            <Icon size={13} style={{ color: column.color }} />
          </div>
          <span className="text-sm font-bold text-zinc-200">{column.label}</span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center"
            style={{ backgroundColor: `${column.color}22`, color: column.color }}
          >
            {projects.length}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: column.color }}
          title={`Nieuw project in ${column.label}`}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${column.color}20`)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {projects.length === 0 ? (
          <button
            onClick={onAdd}
            className="flex items-center justify-center gap-2 w-full py-8 rounded-xl text-xs transition-colors"
            style={{
              border: `1.5px dashed ${column.color}25`,
              color: `${column.color}60`,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = `${column.color}50`
              ;(e.currentTarget as HTMLElement).style.color = column.color
              ;(e.currentTarget as HTMLElement).style.backgroundColor = `${column.color}08`
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = `${column.color}25`
              ;(e.currentTarget as HTMLElement).style.color = `${column.color}60`
              ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            }}
          >
            <Plus size={12} /> Project toevoegen
          </button>
        ) : projects.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            onClick={() => onProjectClick(p)}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main board ───────────────────────────────────────────────────────────────

export default function ProjectsBoard({ initialProjects, clients, contacts, currentUserEmail }: Props) {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [modalStatus, setModalStatus] = useState<StatusValue | null>(null)
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.client?.name ?? '').toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  }, [projects, search])

  async function handleStatusChange(id: string, status: StatusValue) {
    await supabase.from('projects').update({ status }).eq('id', id)
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  function handleUpdate(updated: Project) {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  return (
    <>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Stats pills */}
        <div className="flex items-center gap-2">
          {COLUMNS.map(col => {
            const count = projects.filter(p => p.status === col.value).length
            const Icon = col.icon
            return (
              <div
                key={col.value}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
                style={{
                  backgroundColor: `${col.color}12`,
                  border: `1px solid ${col.color}28`,
                  color: col.color,
                }}
              >
                <Icon size={11} />
                <span>{count} {col.label}</span>
              </div>
            )
          })}
        </div>

        {/* Right side: search + new */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoeken…"
              className="pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 w-44 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                <X size={11} />
              </button>
            )}
          </div>
          <button
            onClick={() => setModalStatus('upcoming')}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white rounded-xl transition-colors"
            style={{ backgroundColor: '#3A913F' }}
          >
            <Plus size={14} /> Nieuw project
          </button>
        </div>
      </div>

      {/* ── Kanban columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.value}
            column={col}
            projects={filtered.filter(p => p.status === col.value)}
            onAdd={() => setModalStatus(col.value)}
            onProjectClick={setDetailProject}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>

      {/* ── Modals ── */}
      {modalStatus && (
        <NewProjectModal
          clients={clients}
          contacts={contacts}
          defaultStatus={modalStatus}
          currentUserEmail={currentUserEmail}
          onClose={() => setModalStatus(null)}
          onSave={project => {
            setProjects(prev => [project, ...prev])
            setModalStatus(null)
          }}
        />
      )}

      {detailProject && (
        <ProjectDetailModal
          project={detailProject}
          contacts={contacts}
          onClose={() => setDetailProject(null)}
          onUpdate={updated => {
            handleUpdate(updated)
            setDetailProject(null)
          }}
          onDelete={id => {
            handleDelete(id)
            setDetailProject(null)
          }}
        />
      )}
    </>
  )
}
