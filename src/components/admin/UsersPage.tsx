'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2, UserPlus, Search, X, AlertCircle,
  Shield, RefreshCw, ChevronRight, Check, UserCheck, Eye,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DEPARTMENTS } from '@/lib/planning-config'
import { usePreview } from '@/lib/preview-context'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamContact {
  email: string | null
  photo_url: string | null
}

interface User {
  id: string
  email: string
  full_name: string
  permissions: Permissions | null
  expires_at: string | null
  last_sign_in: string | null
  created_at: string
  confirmed: boolean
}

interface Permissions {
  sections: string[]
  clients: string[]
  planning_column?: string
  credentials?: string[]
}

interface CredentialOption {
  id: string
  platform: string
  username: string
}

interface ClientOption {
  id: string
  name: string
  category: string
}

const CATEGORY_LABELS: Record<string, string> = {
  intern:  'Intern',
  klant:   'Klanten',
  atleet:  'Atleten',
  podcast: 'Podcasts',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_GROUPS = [
  {
    title: 'Beheer',
    sections: [
      { key: 'beheer', label: 'Beheerpagina & gebruikersbeheer' },
    ],
  },
  {
    title: 'Hoofdnavigatie',
    sections: [
      { key: 'dashboard',       label: 'Dashboard' },
      { key: 'projecten',       label: 'Projecten' },
      { key: 'team',            label: 'Team' },
      { key: 'chat',            label: 'Chat' },
      { key: 'vergaderingen',   label: 'Vergaderingen' },
      { key: 'welkom_stagiair', label: 'Welkom stagiair' },
      { key: 'inspiratiebord',  label: 'Inspiratiebord' },
      { key: 'googlephotos',    label: 'Google Photos' },
    ],
  },
  {
    title: 'Planning',
    sections: [
      { key: 'planning',         label: 'Planning bekijken' },
      { key: 'planning_volledig', label: 'Planning bewerken' },
    ],
  },
  {
    title: 'Kalenders',
    sections: [
      { key: 'projectkalender',             label: 'Projectkalender bekijken' },
      { key: 'projectkalender_toevoegen',   label: 'Projecten toevoegen' },
      { key: 'projectkalender_verwijderen', label: 'Projecten verwijderen' },
      { key: 'contentkalender_toevoegen',   label: 'Contentkalender — posts toevoegen' },
      { key: 'contentkalender_verwijderen', label: 'Contentkalender — posts verwijderen' },
    ],
  },
  {
    title: 'Freelancers',
    sections: [
      { key: 'freelancers', label: 'Freelancer tab bekijken & beheren' },
    ],
  },
  {
    title: 'Pré-assist',
    sections: [
      { key: 'preassist',            label: 'Pré-assist bekijken' },
      { key: 'preassist_beheer',     label: 'Edities toevoegen / verwijderen' },
      { key: 'preassist_toevoegen',  label: 'Content toevoegen' },
      { key: 'preassist_verwijderen', label: 'Content verwijderen' },
    ],
  },
  {
    title: 'Materiaal',
    sections: [
      { key: 'materiaal',               label: 'Materiaal bekijken' },
      { key: 'stats_materiaal',         label: 'Statistieken bekijken' },
      { key: 'materiaal_toevoegen',     label: 'Materiaal toevoegen' },
      { key: 'materiaal_verwijderen',   label: 'Materiaal verwijderen' },
      { key: 'materiaal_reserveren',    label: 'Reserveren' },
      { key: 'reservering_verwijderen', label: 'Reserveringen verwijderen' },
      { key: 'materiaal_extern',        label: 'Extern (externe verhuur)' },
    ],
  },
  {
    title: 'Wachtwoorden',
    sections: [
      { key: 'wachtwoorden_bekijken',    label: 'Bekijken' },
      { key: 'wachtwoorden_toevoegen',   label: 'Toevoegen' },
      { key: 'wachtwoorden_verwijderen', label: 'Verwijderen' },
    ],
  },
  {
    title: 'Financiën',
    sections: [
      { key: 'financien_bekijken', label: 'Documenten bekijken' },
      { key: 'financien_beheren',  label: 'Documenten uploaden & verwijderen' },
    ],
  },
  {
    title: 'Administratie',
    sections: [
      { key: 'administratie_bekijken', label: 'Documenten bekijken' },
      { key: 'administratie_beheren',  label: 'Documenten uploaden & verwijderen' },
    ],
  },
  {
    title: 'Copy Generator',
    sections: [
      { key: 'stijlvoorbeelden', label: 'Stijlvoorbeelden toevoegen & verwijderen' },
    ],
  },
]

const SECTIONS = SECTION_GROUPS.flatMap(g => g.sections)

// ─── Role presets ─────────────────────────────────────────────────────────────
// Update the `sections` arrays below to match the exact permissions per role.

const ROLE_PRESETS = [
  {
    id: 'stagiair',
    label: 'Stagiair',
    color: '#f59e0b',
    sections: [
      'dashboard',
      'welkom_stagiair',
      'team',
      'chat',
    ],
  },
  {
    id: 'creator',
    label: 'Creator',
    color: '#3b82f6',
    sections: [
      'dashboard',
      'projecten',
      'team',
      'chat',
      'vergaderingen',
      'planning',
      'projectkalender',
      'projectkalender_toevoegen',
      'contentkalender_toevoegen',
      'inspiratiebord',
      'googlephotos',
      'materiaal',
      'materiaal_reserveren',
    ],
  },
  {
    id: 'medewerker',
    label: 'Medewerker',
    color: '#06b6d4',
    sections: [
      'dashboard',
      'projecten',
      'team',
      'chat',
      'vergaderingen',
      'planning',
      'planning_volledig',
      'projectkalender',
      'projectkalender_toevoegen',
      'contentkalender_toevoegen',
      'inspiratiebord',
      'googlephotos',
      'materiaal',
      'materiaal_reserveren',
      'preassist',
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    color: '#22c55e',
    sections: SECTIONS.map(s => s.key),
  },
  {
    id: 'freelancer',
    label: 'Freelancer',
    color: '#a855f7',
    sections: [] as string[],
  },
]

const ALL_EMPLOYEES = DEPARTMENTS.flatMap(d => d.employees.map(emp => ({ dept: d.name, emp })))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string, email: string) {
  if (name?.trim()) {
    const parts = name.trim().split(' ')
    return (parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2)).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function UserAvatar({ name, email, photoUrl, size = 8 }: { name: string; email: string; photoUrl?: string | null; size?: number }) {
  const px = size * 4
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name || email} className="rounded-full object-cover flex-shrink-0" style={{ width: px, height: px }} />
  }
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ width: px, height: px, backgroundColor: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46', fontSize: size <= 8 ? 12 : 14 }}>
      {initials(name, email)}
    </div>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return 'Nooit'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Zojuist'
  if (mins < 60) return `${mins} min geleden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} uur geleden`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Role Preset Selector ─────────────────────────────────────────────────────

function RolePresets({ current, onSelect }: { current: string[]; onSelect: (sections: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {ROLE_PRESETS.map(preset => {
        const isActive = preset.sections.length === current.length &&
          preset.sections.every(s => current.includes(s))
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.sections)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              backgroundColor: isActive ? `${preset.color}28` : `${preset.color}10`,
              border: `1px solid ${isActive ? preset.color : `${preset.color}40`}`,
              color: isActive ? preset.color : `${preset.color}cc`,
            }}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ clients, onClose, onInvited }: { clients: ClientOption[]; onClose: () => void; onInvited: () => void }) {
  const allSections = SECTIONS.map(s => s.key)
  const [email,           setEmail]           = useState('')
  const [name,            setName]            = useState('')
  const [phone,           setPhone]           = useState('')
  const [role,            setRole]            = useState('')
  const [sections,        setSections]        = useState<string[]>([])
  const [planningColumn,  setPlanningColumn]  = useState('')
  const [restrictClients, setRestrictClients] = useState(false)
  const [clientIds,       setClientIds]       = useState<string[]>([])
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)

  function toggleSection(key: string) {
    setSections(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Vul een e-mailadres in.'); return }
    setSaving(true); setError('')
    const permissions: Permissions = {
      sections,
      clients: restrictClients ? clientIds : [],
      ...(planningColumn ? { planning_column: planningColumn } : {}),
    }
    const r = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: name, phone, role, permissions }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    setSuccess(true); setSaving(false); onInvited()
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Toegang verlenen</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>
        {success ? (
          <div className="px-5 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-green-900/40 border border-green-700/40 flex items-center justify-center mx-auto mb-3">
              <Check size={16} className="text-green-400" />
            </div>
            <p className="text-sm font-medium text-zinc-200">Toegang verleend!</p>
            <p className="text-xs text-zinc-500 mt-1">{email} kan nu inloggen met Google.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">E-mailadres *</label>
                <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="naam@voorbeeld.be"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Volledige naam</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Voornaam Achternaam"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Telefoonnummer</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+32 470 00 00 00"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Functie</label>
                  <input type="text" value={role} onChange={e => setRole(e.target.value)}
                    placeholder="bijv. Videograaf"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
                </div>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg">
                <span className="text-[10px] text-zinc-500 leading-relaxed">
                  Deze persoon wordt automatisch toegevoegd aan het <span className="text-zinc-300 font-medium">Team</span> met naam, e-mail, telefoon en functie.
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">Toegang</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSections(allSections)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Alles</button>
                    <span className="text-zinc-700">·</span>
                    <button type="button" onClick={() => setSections([])} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Geen</button>
                  </div>
                </div>
                <RolePresets current={sections} onSelect={setSections} />
                <div className="space-y-4 px-1">
                  {SECTION_GROUPS.map(group => (
                    <div key={group.title}>
                      <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">{group.title}</p>
                      <div className="space-y-2 pl-2 border-l border-zinc-800">
                        {group.sections.map(s => (
                          <Checkbox key={s.key} checked={sections.includes(s.key)} onChange={() => toggleSection(s.key)} label={s.label} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Planning kolom</label>
                <select value={planningColumn} onChange={e => setPlanningColumn(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors">
                  <option value="">— Volledige planning (of via checkbox) —</option>
                  <option value="__none__">— Mag niets bewerken —</option>
                  {ALL_EMPLOYEES.map(({ dept, emp }) => (
                    <option key={`${dept}-${emp}`} value={emp}>{emp} ({dept})</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">Klantentoegang</label>
                </div>
                <Checkbox
                  checked={restrictClients}
                  onChange={v => { setRestrictClients(v); if (!v) setClientIds([]) }}
                  label="Beperk tot specifieke klanten"
                />
                {restrictClients && (
                  <div className="mt-3 space-y-4 pl-2 border-l border-zinc-800">
                    {(['intern', 'klant', 'atleet', 'podcast'] as const).map(cat => {
                      const catClients = clients.filter(c => c.category === cat)
                      if (!catClients.length) return null
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">{CATEGORY_LABELS[cat]}</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setClientIds(prev => [...new Set([...prev, ...catClients.map(c => c.id)])])}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Alles</button>
                              <span className="text-zinc-700">·</span>
                              <button type="button" onClick={() => setClientIds(prev => prev.filter(id => !catClients.some(c => c.id === id)))}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Geen</button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {catClients.map(c => (
                              <Checkbox
                                key={c.id}
                                checked={clientIds.includes(c.id)}
                                onChange={v => setClientIds(prev => v ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                                label={c.name}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
                  <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Annuleren</button>
              <button type="submit" disabled={saving}
                className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                Toegang verlenen
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
        style={checked
          ? { backgroundColor: '#3A913F', border: '1px solid #3A913F' }
          : { backgroundColor: 'transparent', border: '1px solid #3f3f46' }}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors select-none">{label}</span>
    </label>
  )
}

// ─── Permissions Panel ────────────────────────────────────────────────────────

function PermissionsPanel({
  user, photoUrl, clients, onClose, onSaved,
}: {
  user: User
  photoUrl?: string | null
  clients: ClientOption[]
  onClose: () => void
  onSaved: (userId: string, permissions: Permissions | null, expiresAt?: string | null) => void
}) {
  const allSections = SECTIONS.map(s => s.key)

  const [sections,       setSections]       = useState<string[]>(
    user.permissions ? user.permissions.sections : allSections
  )
  const [planningColumn, setPlanningColumn] = useState<string>(user.permissions?.planning_column ?? '')
  const [expiresAt,      setExpiresAt]      = useState<string>(
    user.expires_at ? user.expires_at.split('T')[0] : ''
  )
  const [restrictClients, setRestrictClients] = useState(
    (user.permissions?.clients?.length ?? 0) > 0
  )
  const [clientIds, setClientIds] = useState<string[]>(
    user.permissions?.clients ?? []
  )
  const [saving,         setSaving]         = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [allCredentials, setAllCredentials] = useState<CredentialOption[]>([])
  const [credIds,        setCredIds]        = useState<string[]>(user.permissions?.credentials ?? [])
  const [credsReady,     setCredsReady]     = useState(false)

  useEffect(() => {
    createClient().from('credentials').select('id, platform, username').order('platform').then(({ data }) => {
      const creds = (data ?? []) as CredentialOption[]
      setAllCredentials(creds)
      if (!user.permissions?.credentials) {
        setCredIds(creds.map(c => c.id))
      }
      setCredsReady(true)
    })
  }, [])

  function toggleSection(key: string) {
    setSections(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  function toggleAllSections(val: boolean) {
    setSections(val ? allSections : [])
  }

  function toggleCred(id: string) {
    setCredIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    const hasBekijken = sections.includes('wachtwoorden_bekijken')
    const permissions: Permissions = {
      sections,
      clients: restrictClients ? clientIds : [],
      ...(planningColumn ? { planning_column: planningColumn } : {}),
      ...(hasBekijken ? { credentials: credIds } : {}),
    }
    const r = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions, expires_at: expiresAt || null }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    setSaved(true); setSaving(false)
    onSaved(user.id, permissions, expiresAt || null)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    const r = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    if (!r.ok) { setError(await r.text()); setDeleting(false); return }
    onSaved(user.id, null)
    onClose()
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-800" style={{ minWidth: 340, maxWidth: 400 }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar name={user.full_name} email={user.email} photoUrl={photoUrl} size={9} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{user.full_name || '–'}</p>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
        </div>
        <button onClick={onClose} className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5">
          <X size={15} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        {/* Sections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Toegang</p>
            <div className="flex gap-2">
              <button onClick={() => toggleAllSections(true)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Alles</button>
              <span className="text-zinc-700">·</span>
              <button onClick={() => toggleAllSections(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Geen</button>
            </div>
          </div>
          <RolePresets current={sections} onSelect={setSections} />
          <div className="space-y-4 mt-1">
            {SECTION_GROUPS.map(group => (
              <div key={group.title}>
                <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">{group.title}</p>
                <div className="space-y-2 pl-2 border-l border-zinc-800">
                  {group.sections.map(s => (
                    <Checkbox key={s.key} checked={sections.includes(s.key)} onChange={() => toggleSection(s.key)} label={s.label} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credentials */}
        {sections.includes('wachtwoorden_bekijken') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Wachtwoorden</p>
              <div className="flex gap-2">
                <button onClick={() => setCredIds(allCredentials.map(c => c.id))} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Alles</button>
                <span className="text-zinc-700">·</span>
                <button onClick={() => setCredIds([])} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Geen</button>
              </div>
            </div>
            {!credsReady ? (
              <p className="text-xs text-zinc-600">Laden…</p>
            ) : allCredentials.length === 0 ? (
              <p className="text-xs text-zinc-600">Nog geen wachtwoorden aangemaakt.</p>
            ) : (
              <div className="space-y-2.5">
                {allCredentials.map(c => (
                  <Checkbox
                    key={c.id}
                    checked={credIds.includes(c.id)}
                    onChange={() => toggleCred(c.id)}
                    label={`${c.platform} — ${c.username}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Planning column */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Planning kolom</p>
          <select value={planningColumn} onChange={e => setPlanningColumn(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors">
            <option value="">— Volledige planning (of via checkbox) —</option>
            <option value="__none__">— Mag niets bewerken —</option>
            {ALL_EMPLOYEES.map(({ dept, emp }) => (
              <option key={`${dept}-${emp}`} value={emp}>{emp} ({dept})</option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-600 mt-1.5">Laat leeg als de gebruiker de volledige planning mag bewerken.</p>
        </div>

        {/* Client access */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Klantentoegang</p>
          <Checkbox
            checked={restrictClients}
            onChange={v => { setRestrictClients(v); if (!v) setClientIds([]) }}
            label="Beperk tot specifieke klanten"
          />
          {restrictClients && (
            <div className="mt-3 space-y-4 pl-2 border-l border-zinc-800">
              {(['intern', 'klant', 'atleet', 'podcast'] as const).map(cat => {
                const catClients = clients.filter(c => c.category === cat)
                if (!catClients.length) return null
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">{CATEGORY_LABELS[cat]}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setClientIds(prev => [...new Set([...prev, ...catClients.map(c => c.id)])])}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Alles</button>
                        <span className="text-zinc-700">·</span>
                        <button type="button" onClick={() => setClientIds(prev => prev.filter(id => !catClients.some(c => c.id === id)))}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Geen</button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {catClients.map(c => (
                        <Checkbox
                          key={c.id}
                          checked={clientIds.includes(c.id)}
                          onChange={v => setClientIds(prev => v ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                          label={c.name}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
              {restrictClients && clientIds.length === 0 && (
                <p className="text-[10px] text-amber-500">Geen klanten geselecteerd — gebruiker ziet niets.</p>
              )}
            </div>
          )}
          {!restrictClients && (
            <p className="text-[10px] text-zinc-600 mt-1.5">Gebruiker ziet alle klanten, atleten en podcasts.</p>
          )}
        </div>

        {/* Expiry date */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Vervaldatum account</p>
          <input
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {expiresAt ? (
            <div className="mt-1.5 space-y-1">
              {new Date(expiresAt) <= new Date() ? (
                <p className="text-xs text-red-400">Account verlopen — wordt verwijderd bij de volgende nachtelijke check.</p>
              ) : (new Date(expiresAt).getTime() - Date.now()) / 86400000 <= 7 ? (
                <p className="text-xs text-amber-400">
                  Verloopt over {Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)} dag(en).
                </p>
              ) : (
                <p className="text-[10px] text-zinc-600">
                  Account wordt automatisch verwijderd op {new Date(expiresAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}.
                </p>
              )}
              <button onClick={() => setExpiresAt('')} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                Datum wissen
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600 mt-1.5">Laat leeg voor geen automatische verwijdering.</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-5 py-3 border-t border-zinc-800 space-y-2">
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-all"
          style={{ backgroundColor: saved ? '#15803d' : '#3A913F' }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
          {saved ? 'Opgeslagen' : saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>

        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="w-full py-2 text-xs text-zinc-600 hover:text-red-400 transition-colors">
            Gebruiker verwijderen
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Annuleren
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors">
              {deleting && <Loader2 size={11} className="animate-spin" />}
              Zeker verwijderen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Freelancer Invite Modal ──────────────────────────────────────────────────

function FreelancerInviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Naam is verplicht.'); return }
    if (!email.trim()) { setError('E-mailadres is verplicht.'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/freelancers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || null }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    setSuccess(true); setSaving(false); onInvited()
    setTimeout(onClose, 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Freelancer uitnodigen</h2>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>
        {success ? (
          <div className="px-5 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-900/40 border border-purple-700/40 flex items-center justify-center mx-auto mb-3">
              <Check size={16} className="text-purple-400" />
            </div>
            <p className="text-sm font-medium text-zinc-200">Freelancer toegevoegd!</p>
            <p className="text-xs text-zinc-500 mt-1">{email} kan nu inloggen via het portaal.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                De freelancer kan inloggen via de gewone loginpagina met zijn/haar Google-account.
                Ze krijgen automatisch toegang tot het freelancersportaal.
              </p>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Naam *</label>
                <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Voornaam Achternaam"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">E-mailadres *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="naam@voorbeeld.be"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Telefoonnummer</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+32 470 00 00 00"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
              </div>
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
                  <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Annuleren</button>
              <button type="submit" disabled={saving}
                className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#7c3aed' }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                Toevoegen
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { setPreview } = usePreview()
  const router = useRouter()
  const [users,        setUsers]        = useState<User[]>([])
  const [teamContacts, setTeamContacts] = useState<TeamContact[]>([])
  const [allClients,      setAllClients]      = useState<ClientOption[]>([])
  const [freelancerEmails, setFreelancerEmails] = useState<Set<string>>(new Set())
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState('')
  const [showInvite,      setShowInvite]       = useState(false)
  const [showFreelanceInvite, setShowFreelanceInvite] = useState(false)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/users')
    if (r.ok) setUsers(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.ok ? r.json() : [])
      .then((data: TeamContact[]) => setTeamContacts(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    createClient()
      .from('clients')
      .select('id, name, category')
      .order('name')
      .then(({ data }) => setAllClients((data ?? []) as ClientOption[]))
  }, [])

  useEffect(() => {
    fetch('/api/freelancers')
      .then(r => r.ok ? r.json() : [])
      .then((data: { email: string | null }[]) => {
        setFreelancerEmails(new Set(data.map(f => f.email?.toLowerCase()).filter(Boolean) as string[]))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  function handlePreviewAs(u: User) {
    setPreview({
      email: u.email,
      name: u.full_name || u.email,
      permissions: u.permissions,
      isFreelancer: freelancerEmails.has(u.email.toLowerCase()),
    })
    router.push('/dashboard')
  }

  function handlePanelSaved(userId: string, permissions: Permissions | null, expiresAt?: string | null) {
    if (permissions === null) {
      setUsers(prev => prev.filter(u => u.id !== userId))
      setSelectedId(null)
    } else {
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, permissions, expires_at: expiresAt !== undefined ? expiresAt : u.expires_at }
          : u
      ))
    }
  }

  const photoByEmail = Object.fromEntries(
    teamContacts.filter(c => c.email && c.photo_url).map(c => [c.email!.toLowerCase(), c.photo_url!])
  )

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)
  })

  const selectedUser = users.find(u => u.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left: user list ── */}
      <div className="flex-1 min-w-0 flex flex-col p-6 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Shield size={15} className="text-zinc-500" />
              <h1 className="text-lg font-semibold text-zinc-100">Gebruikersbeheer</h1>
            </div>
            <p className="text-sm text-zinc-500">{users.length} {users.length === 1 ? 'gebruiker' : 'gebruikers'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadUsers} disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowFreelanceInvite(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-300 rounded-lg transition-colors border"
              style={{ backgroundColor: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.35)' }}>
              <UserCheck size={14} />
              Freelancer
            </button>
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: '#3A913F' }}>
              <UserPlus size={14} />
              Toegang verlenen
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4 flex-shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam of e-mailadres…"
            className="w-full pl-8 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={12} /></button>
          )}
        </div>

        {/* Table */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-600">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-600">
              {search ? 'Geen gebruikers gevonden.' : 'Nog geen gebruikers.'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Gebruiker</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Toegang</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Laatste login</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map(u => {
                  const isSelected = u.id === selectedId
                  const knownKeys = SECTIONS.map(s => s.key)
                  const sectionCount = u.permissions
                    ? u.permissions.sections.filter(s => knownKeys.includes(s)).length
                    : SECTIONS.length
                  return (
                    <tr key={u.id}
                      onClick={() => setSelectedId(isSelected ? null : u.id)}
                      className="transition-colors cursor-pointer group"
                      style={{ backgroundColor: isSelected ? 'rgba(58,145,63,0.06)' : undefined }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.full_name} email={u.email} photoUrl={photoByEmail[u.email.toLowerCase()]} size={8} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">{u.full_name || <span className="text-zinc-500 italic">Geen naam</span>}</p>
                            <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {freelancerEmails.has(u.email.toLowerCase()) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: '#c084fc', backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                            <UserCheck size={10} /> Freelancer
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            {sectionCount === SECTIONS.length ? 'Alles' : sectionCount === 0 ? 'Geen' : `${sectionCount} van ${SECTIONS.length}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-zinc-500">{formatDate(u.last_sign_in)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          {u.confirmed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={{ color: '#4ade80', backgroundColor: '#16a34a18', border: '1px solid #16a34a35' }}>
                              <span className="w-1 h-1 rounded-full bg-green-400" />Actief
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={{ color: '#f59e0b', backgroundColor: '#f59e0b18', border: '1px solid #f59e0b35' }}>
                              <span className="w-1 h-1 rounded-full bg-amber-400" />Uitgenodigd
                            </span>
                          )}
                          {u.expires_at && (() => {
                            const d = new Date(u.expires_at!)
                            const isExpired = d <= new Date()
                            const isSoon = !isExpired && (d.getTime() - Date.now()) / 86400000 <= 7
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={isExpired
                                  ? { color: '#f87171', backgroundColor: '#450a0a30', border: '1px solid #991b1b40' }
                                  : isSoon
                                  ? { color: '#fbbf24', backgroundColor: '#451a0330', border: '1px solid #92400e40' }
                                  : { color: '#71717a', backgroundColor: '#27272a30', border: '1px solid #3f3f4640' }}>
                                {isExpired ? '⚠ Verlopen' : `Verloopt ${d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}`}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); handlePreviewAs(u) }}
                            title="Bekijk platform als deze gebruiker"
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all hover:bg-zinc-700"
                            style={{ color: '#a1a1aa' }}
                          >
                            <Eye size={11} />
                            Bekijk als
                          </button>
                          <ChevronRight size={13} className={`transition-all ${isSelected ? 'text-zinc-300 rotate-90' : 'text-zinc-700 group-hover:text-zinc-500'}`} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right: permissions panel ── */}
      {selectedUser && (
        <PermissionsPanel
          key={selectedUser.id}
          user={selectedUser}
          photoUrl={photoByEmail[selectedUser.email.toLowerCase()]}
          clients={allClients}
          onClose={() => setSelectedId(null)}
          onSaved={handlePanelSaved}
        />
      )}

      {showInvite && (
        <InviteModal clients={allClients} onClose={() => setShowInvite(false)} onInvited={loadUsers} />
      )}

      {showFreelanceInvite && (
        <FreelancerInviteModal
          onClose={() => setShowFreelanceInvite(false)}
          onInvited={() => {
            fetch('/api/freelancers')
              .then(r => r.ok ? r.json() : [])
              .then((data: { email: string | null }[]) => {
                setFreelancerEmails(new Set(data.map(f => f.email?.toLowerCase()).filter(Boolean) as string[]))
              })
          }}
        />
      )}
    </div>
  )
}
