'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2, UserPlus, Search, X, AlertCircle,
  Shield, RefreshCw, ChevronRight, ChevronDown, Check, UserCheck, Eye, RotateCcw,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Person } from '@/lib/planning-config'
import { usePreview } from '@/lib/preview-context'
import {
  ACCESS_MODULES, ACCESS_GROUPS, effectiveLevels, levelOf, levelsFromSections, sectionsForLevels,
  type AccessLevels,
} from '@/lib/access-roles'
import type { RoleRow } from '@/components/admin/RolesPage'

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
  access_role: string | null
  role_overrides: AccessLevels
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

// ─── Rollen ───────────────────────────────────────────────────────────────────
// Welke rollen er zijn en wat ze mogen, staat in Beheer → Rollen. Hier kies je
// er per persoon één, plus eventueel een paar afwijkingen.

function useRoles() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/roles')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: RoleRow[]) => { if (!cancelled) { setRoles(rows); setReady(true) } })
      .catch(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])
  return { roles, ready }
}

function RolePicker({ roles, value, onChange }: { roles: RoleRow[]; value: string | null; onChange: (id: string) => void }) {
  if (roles.length === 0) {
    return <p className="text-xs text-amber-400">Nog geen rollen — maak ze aan onder Beheer → Rollen.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map(r => {
        const active = r.id === value
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            aria-pressed={active}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              backgroundColor: active ? `${r.color}28` : `${r.color}0d`,
              border: `1px solid ${active ? r.color : `${r.color}40`}`,
              color: active ? r.color : `${r.color}bb`,
            }}
          >
            {active && <Check size={11} strokeWidth={3} />}
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

function RoleBadge({ role, overrides }: { role: RoleRow | undefined; overrides: number }) {
  if (!role) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: role.color, backgroundColor: `${role.color}18`, border: `1px solid ${role.color}45` }}>
      {role.label}
      {overrides > 0 && <span className="font-normal opacity-80">+{overrides}</span>}
    </span>
  )
}

// Afwijkingen van de rol voor één persoon. Ingeklapt zolang er geen zijn —
// de bedoeling is dat je hier zelden moet komen.
function OverridesEditor({ roleLevels, overrides, onChange }: {
  roleLevels: AccessLevels | undefined
  overrides: AccessLevels
  onChange: (next: AccessLevels) => void
}) {
  const count = Object.keys(overrides).length
  const [open, setOpen] = useState(count > 0)
  const effective = effectiveLevels(roleLevels, overrides)

  function set(moduleKey: string, level: string) {
    const next = { ...overrides }
    const mod = ACCESS_MODULES.find(m => m.key === moduleKey)!
    if (levelOf(roleLevels, mod) === level) delete next[moduleKey]
    else next[moduleKey] = level
    onChange(next)
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Aanpassingen voor deze persoon
        {count > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300">{count}</span>
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {count > 0 && (
            <button type="button" onClick={() => onChange({})}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300">
              <RotateCcw size={10} /> Alles terug naar de rol
            </button>
          )}
          {ACCESS_GROUPS.map(group => (
            <div key={group}>
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-1.5">{group}</p>
              <div className="space-y-1.5 pl-2 border-l border-zinc-800">
                {ACCESS_MODULES.filter(m => m.group === group).map(m => {
                  const isOverride = m.key in overrides
                  const roleValue = levelOf(roleLevels, m)
                  return (
                    <div key={m.key} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 flex-1 min-w-0 truncate" title={m.hint}>{m.label}</span>
                      <select
                        value={effective[m.key]}
                        onChange={e => set(m.key, e.target.value)}
                        aria-label={m.label}
                        className={`w-40 px-2 py-1 rounded-md text-xs bg-zinc-900 border focus:outline-none ${
                          isOverride ? 'border-amber-600/70 text-amber-200' : 'border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {m.levels.map(l => (
                          <option key={l.key} value={l.key}>
                            {l.label}{l.key === roleValue ? ' (rol)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TeamContactRow {
  id: string
  name: string
  email: string | null
  employment_type?: string | null
  active_until?: string | null
}

// Het Team-contact dat bij dit account hoort, op e-mailadres. Daar staat de
// einddatum van de persoon, en die is de bron: het account volgt hem, niet
// omgekeerd.
function useTeamContact(email: string | undefined) {
  const [contact, setContact] = useState<TeamContactRow | null>(null)
  useEffect(() => {
    if (!email) return
    let cancelled = false
    fetch('/api/team/members')
      .then(r => (r.ok ? r.json() : null))
      .then((rows: TeamContactRow[] | null) => {
        if (cancelled || !Array.isArray(rows)) return
        const wanted = email.trim().toLowerCase()
        setContact(rows.find(c => c.email?.trim().toLowerCase() === wanted) ?? null)
      })
      .catch(() => { /* zonder contact werkt het veld gewoon handmatig */ })
    return () => { cancelled = true }
  }, [email])
  return contact
}

// Het rooster, met de namen erbij opgezocht.
//
// planning_config houdt alleen contact-id's bij, dus de namen komen uit
// /api/team/members. Die twee samen geven de lijst die hier in de dropdown
// hoort — en omdat de naam nergens gekopieerd wordt, klopt hij altijd.
function usePlanningRoster() {
  const [roster, setRoster] = useState<Person[]>([])
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/planning/config').then(r => (r.ok ? r.json() : null)),
      fetch('/api/team/members').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([cfg, contacts]: [{ name: string; employees: string[] }[] | null, TeamContactRow[] | null]) => {
        if (cancelled || !Array.isArray(cfg) || !Array.isArray(contacts)) return
        const byId = new Map(contacts.map(c => [c.id, c]))
        setRoster(cfg.flatMap(d =>
          d.employees
            .map(id => {
              const c = byId.get(id)
              return c ? { id, dept: d.name, emp: c.name } : null
            })
            .filter((p): p is Person => p !== null)
        ))
      })
      .catch(() => { /* lege lijst is het eerlijke antwoord */ })
    return () => { cancelled = true }
  }, [])
  return roster
}

// Een toekenning van vóór deze wijziging is een naam of een
// `afdeling|naam`-sleutel. Die hoort als eigen optie in de lijst te staan,
// anders valt de select terug op "volledige planning" en zou opslaan de
// rechten van die persoon stil oprekken.
//
// Een contact-id is een uuid; alles zonder koppeltekens is dus oud.
function legacyColumnOption(planningColumn: string) {
  if (!planningColumn || planningColumn === '__none__') return null
  return planningColumn.includes('-') ? null : planningColumn
}

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

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ clients, roles, onClose, onInvited }: { clients: ClientOption[]; roles: RoleRow[]; onClose: () => void; onInvited: () => void }) {
  const [email,           setEmail]           = useState('')
  const [name,            setName]            = useState('')
  const [phone,           setPhone]           = useState('')
  const [role,            setRole]            = useState('')
  const [accessRole,      setAccessRole]      = useState<string | null>(null)
  const [advanced,        setAdvanced]        = useState(false)
  const [planningColumn,  setPlanningColumn]  = useState('')
  const roster = usePlanningRoster()
  const legacyColumn = legacyColumnOption(planningColumn)
  const [restrictClients, setRestrictClients] = useState(false)
  const [clientIds,       setClientIds]       = useState<string[]>([])
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Vul een e-mailadres in.'); return }
    if (!accessRole) { setError('Kies een rol.'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, full_name: name, phone, role,
        access_role: accessRole,
        clients: restrictClients ? clientIds : [],
        planning_column: planningColumn || null,
      }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    setSuccess(true); setSaving(false); onInvited()
    setTimeout(onClose, 1500)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Toegang verlenen</h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Rol *</label>
                <RolePicker roles={roles} value={accessRole} onChange={setAccessRole} />
                <p className="text-[10px] text-zinc-600 mt-2">
                  Wat elke rol mag, stel je in onder Rollen. Uitzonderingen voor deze persoon kan je na het uitnodigen toevoegen.
                </p>
              </div>
              <button type="button" onClick={() => setAdvanced(a => !a)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                {advanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Geavanceerd: planningkolom en klantentoegang
              </button>
              {advanced && (<>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Planning kolom</label>
                <p className="text-[10px] text-zinc-600 mb-1.5">
                  Bepaalt wat het scherm aanbiedt, niet wat de database toestaat.
                  Zie de noot onderaan.
                </p>
                <select value={planningColumn} onChange={e => setPlanningColumn(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors">
                  <option value="">— Volgens de rol —</option>
                  <option value="__none__">— Mag niets bewerken —</option>
                  {legacyColumn && (
                    <option value={legacyColumn}>{legacyColumn} (oude toekenning)</option>
                  )}
                  {roster.map(p => (
                    <option key={p.id} value={p.id}>{p.emp} ({p.dept})</option>
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
              </>)}
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
                  <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
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
    <label onClick={() => onChange(!checked)} className="tap-target flex items-center gap-2.5 cursor-pointer group">
      <div
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

// Kleiner vakje voor de selectie in de lijst — zonder label ernaast.
function MiniCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      className="tap-target w-4 h-4 rounded flex items-center justify-center transition-all"
      style={checked
        ? { backgroundColor: '#3A913F', border: '1px solid #3A913F' }
        : { backgroundColor: 'transparent', border: '1px solid #3f3f46' }}>
      {checked && <Check size={10} className="text-white" strokeWidth={3} />}
    </button>
  )
}

// ─── Permissions Panel ────────────────────────────────────────────────────────

function PermissionsPanel({
  user, photoUrl, clients, roles, onClose, onSaved, onDeleted,
}: {
  user: User
  photoUrl?: string | null
  clients: ClientOption[]
  roles: RoleRow[]
  onClose: () => void
  onSaved: () => void
  onDeleted: (userId: string) => void
}) {
  // Een account van vóór de rollen heeft alleen een sleutellijst. Die lezen
  // we terug als afwijkingen zonder rol, zodat het scherm toont wat hij nu
  // mag; zodra je een rol kiest, worden het afwijkingen op die rol.
  const legacyLevels = !user.access_role && user.permissions ? levelsFromSections(user.permissions.sections) : null
  const [accessRole, setAccessRole] = useState<string | null>(user.access_role)
  const [overrides,  setOverrides]  = useState<AccessLevels>(
    user.access_role ? (user.role_overrides ?? {}) : (legacyLevels ?? {})
  )
  const role = roles.find(r => r.id === accessRole)
  const sections = sectionsForLevels(effectiveLevels(role?.levels, overrides))
  const [planningColumn, setPlanningColumn] = useState<string>(user.permissions?.planning_column ?? '')
  const roster = usePlanningRoster()
  const legacyColumn = legacyColumnOption(planningColumn)
  const [expiresAt,      setExpiresAt]      = useState<string>(
    user.expires_at ? user.expires_at.split('T')[0] : ''
  )
  const teamContact = useTeamContact(user.email)
  const contactEnd = teamContact?.active_until ?? ''
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

  // Rol wisselen houdt alleen de afwijkingen die ook ten opzichte van de
  // nieuwe rol nog iets veranderen.
  function chooseRole(id: string) {
    const next = roles.find(r => r.id === id)
    const kept: AccessLevels = {}
    const current = effectiveLevels(role?.levels, overrides)
    for (const m of ACCESS_MODULES) {
      if (m.key in overrides && levelOf(next?.levels, m) !== current[m.key]) kept[m.key] = current[m.key]
    }
    setAccessRole(id)
    setOverrides(accessRole ? kept : {})
  }

  function toggleCred(id: string) {
    setCredIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    if (!accessRole) { setError('Kies een rol.'); setSaving(false); return }
    const r = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_role: accessRole,
        overrides,
        clients: restrictClients ? clientIds : [],
        planning_column: planningColumn || null,
        credentials: sections.includes('wachtwoorden_bekijken') ? credIds : null,
        expires_at: expiresAt || null,
      }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    setSaved(true); setSaving(false)
    onSaved()
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    const r = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    if (!r.ok) { setError(await r.text()); setDeleting(false); return }
    onDeleted(user.id)
  }

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 w-full lg:static lg:z-auto lg:w-auto lg:min-w-[340px] lg:max-w-[400px] flex flex-col h-full lg:border-l border-zinc-800">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar name={user.full_name} email={user.email} photoUrl={photoUrl} size={9} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 truncate">{user.full_name || '–'}</p>
            <p className="text-xs text-zinc-500 truncate">{user.email}</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Sluiten" className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5">
          <X size={15} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        {/* Rol */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">Rol</p>
          {!user.access_role && (
            <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-amber-950/30 border border-amber-900/40 rounded-lg">
              <AlertCircle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-300 leading-relaxed">
                {user.permissions
                  ? 'Dit account heeft nog geen rol. Wat hij nu mag staat hieronder als aanpassingen; kies een rol om het op te ruimen.'
                  : 'Dit account heeft nog geen rol en geen rechten ingesteld — daardoor ziet hij op sommige plekken alles. Kies een rol.'}
              </p>
            </div>
          )}
          <RolePicker roles={roles} value={accessRole} onChange={chooseRole} />
          <div className="mt-4">
            <OverridesEditor roleLevels={role?.levels} overrides={overrides} onChange={setOverrides} />
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
          <p className="text-[10px] text-zinc-600 mb-2">
            Bepaalt welke cellen dit account op het scherm mag bewerken. Het is
            een weergavebeperking, geen beveiliging: wie de browserconsole
            opent kan elke cel schrijven, net als elke andere ingelogde
            collega. Bewust zo gelaten — iedereen met een account werkt hier.
          </p>
          <select value={planningColumn} onChange={e => setPlanningColumn(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors">
            <option value="">— Volgens de rol —</option>
            <option value="__none__">— Mag niets bewerken —</option>
            {legacyColumn && (
              <option value={legacyColumn}>{legacyColumn} (oude toekenning)</option>
            )}
            {roster.map(p => (
              <option key={p.id} value={p.id}>{p.emp} ({p.dept})</option>
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

          {/* Dezelfde datum stond op twee plekken en moest twee keer getypt
              worden: hier op het account, en op de Team-pagina als einddatum
              van de persoon. Vergeet je er één, dan verdwijnt zijn login wel
              en blijft hij in het rooster staan, of net omgekeerd.
              De einddatum in Team is de bron — dat is de persoon, en die
              overleeft zijn account. */}
          {contactEnd && contactEnd !== expiresAt && (
            <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-sky-900/40 bg-sky-950/20 px-2.5 py-2">
              <p className="text-[10px] text-sky-300 flex-1">
                In Team staat {teamContact?.name} als {teamContact?.employment_type ?? 'vast'} tot{' '}
                {new Date(contactEnd + 'T00:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                {expiresAt ? ' — dat wijkt af van de datum hierboven.' : '.'}
              </p>
              <button
                onClick={() => setExpiresAt(contactEnd)}
                className="flex-shrink-0 text-[10px] font-medium text-sky-300 underline hover:text-sky-200"
              >
                Overnemen
              </button>
            </div>
          )}
          {contactEnd && contactEnd === expiresAt && (
            <p className="mt-1.5 text-[10px] text-zinc-600">
              Gelijk aan de einddatum van {teamContact?.name} in Team.
            </p>
          )}
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Freelancer uitnodigen</h2>
          </div>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
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
            <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
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
  const [checked,         setChecked]         = useState<Set<string>>(new Set())
  const [bulkRole,        setBulkRole]        = useState('')
  const [bulkBusy,        setBulkBusy]        = useState(false)
  const [bulkMessage,     setBulkMessage]     = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const { roles } = useRoles()

  // silent: na opslaan opnieuw ophalen zonder dat de lijst even verdwijnt.
  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
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

  function handleDeleted(userId: string) {
    setUsers(prev => prev.filter(u => u.id !== userId))
    setChecked(prev => { const n = new Set(prev); n.delete(userId); return n })
    setSelectedId(null)
  }

  function toggleChecked(id: string) {
    setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    setBulkMessage(null)
  }

  async function applyBulkRole() {
    if (!bulkRole || checked.size === 0) return
    setBulkBusy(true); setBulkMessage(null)
    const r = await fetch('/api/admin/users/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...checked], access_role: bulkRole }),
    })
    setBulkBusy(false)
    if (!r.ok) { setBulkMessage({ kind: 'error', text: await r.text() }); await loadUsers(true); return }
    const { updated } = await r.json()
    const label = roles.find(x => x.id === bulkRole)?.label ?? bulkRole
    setBulkMessage({ kind: 'ok', text: `${updated} ${updated === 1 ? 'persoon is nu' : 'mensen zijn nu'} ${label}.` })
    setChecked(new Set()); setBulkRole('')
    await loadUsers(true)
  }

  const photoByEmail = Object.fromEntries(
    teamContacts.filter(c => c.email && c.photo_url).map(c => [c.email!.toLowerCase(), c.photo_url!])
  )

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)
  })

  const selectedUser = users.find(u => u.id === selectedId) ?? null
  const selectable = filtered.filter(u => !freelancerEmails.has(u.email.toLowerCase()))

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left: user list ── */}
      <div className="flex-1 min-w-0 flex flex-col p-4 sm:p-6 overflow-hidden">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Shield size={15} className="text-zinc-500 flex-shrink-0" />
              <h1 className="text-lg font-semibold text-zinc-100 truncate">Gebruikersbeheer</h1>
            </div>
            <p className="text-sm text-zinc-500">{users.length} {users.length === 1 ? 'gebruiker' : 'gebruikers'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <button onClick={() => loadUsers()} disabled={loading} aria-label="Ververs gebruikerslijst"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors disabled:opacity-40 flex-shrink-0">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowFreelanceInvite(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-300 rounded-lg transition-colors border flex-shrink-0"
              style={{ backgroundColor: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.35)' }}>
              <UserCheck size={14} />
              Freelancer
            </button>
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex-shrink-0"
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
            <button onClick={() => setSearch('')} aria-label="Zoekopdracht wissen" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={12} /></button>
          )}
        </div>

        {/* Bulk */}
        {(checked.size > 0 || bulkMessage) && (
          <div className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 flex-shrink-0">
            {checked.size > 0 && (
              <>
                <span className="text-xs text-zinc-300">{checked.size} geselecteerd</span>
                <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} aria-label="Rol voor de selectie"
                  className="px-2 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none">
                  <option value="">Rol geven…</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button onClick={applyBulkRole} disabled={!bulkRole || bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white rounded-md disabled:opacity-40"
                  style={{ backgroundColor: '#3A913F' }}>
                  {bulkBusy && <Loader2 size={11} className="animate-spin" />}
                  Toepassen
                </button>
                <button onClick={() => setChecked(new Set())} className="text-xs text-zinc-500 hover:text-zinc-300">Selectie wissen</button>
              </>
            )}
            {bulkMessage && (
              <span className={`text-xs ${bulkMessage.kind === 'ok' ? 'text-green-400' : 'text-red-400'} ${checked.size > 0 ? '' : 'flex-1'}`}>
                {bulkMessage.text}
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <div className="border border-zinc-800 rounded-xl flex-1 overflow-y-auto scroll-x">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-zinc-600">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-600">
              {search ? 'Geen gebruikers gevonden.' : 'Nog geen gebruikers.'}
            </div>
          ) : (
            <table className="w-full min-w-[720px] sm:min-w-0">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="pl-4 py-3 w-8">
                    <MiniCheck
                      checked={selectable.length > 0 && selectable.every(u => checked.has(u.id))}
                      onChange={v => setChecked(v ? new Set(selectable.map(u => u.id)) : new Set())}
                      label="Alles selecteren"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Gebruiker</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Rol</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Laatste login</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map(u => {
                  const isSelected = u.id === selectedId
                  const isFreelancer = freelancerEmails.has(u.email.toLowerCase())
                  const userRole = roles.find(r => r.id === u.access_role)
                  return (
                    <tr key={u.id}
                      onClick={() => setSelectedId(isSelected ? null : u.id)}
                      className="transition-colors cursor-pointer group"
                      style={{ backgroundColor: isSelected ? 'rgba(58,145,63,0.06)' : undefined }}>
                      <td className="pl-4 py-3 w-8" onClick={e => e.stopPropagation()}>
                        {!isFreelancer && (
                          <MiniCheck checked={checked.has(u.id)} onChange={() => toggleChecked(u.id)} label={`Selecteer ${u.full_name || u.email}`} />
                        )}
                      </td>
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
                        {isFreelancer ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: '#c084fc', backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                            <UserCheck size={10} /> Freelancer
                          </span>
                        ) : userRole ? (
                          <RoleBadge role={userRole} overrides={Object.keys(u.role_overrides ?? {}).length} />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                            style={{ color: '#fbbf24', backgroundColor: '#451a0330', border: '1px solid #92400e50' }}>
                            {u.permissions ? 'Geen rol' : 'Geen rol · ziet veel'}
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
                            className="sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all hover:bg-zinc-700"
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
          roles={roles}
          onClose={() => setSelectedId(null)}
          onSaved={() => loadUsers(true)}
          onDeleted={handleDeleted}
        />
      )}

      {showInvite && (
        <InviteModal clients={allClients} roles={roles} onClose={() => setShowInvite(false)} onInvited={() => loadUsers(true)} />
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
