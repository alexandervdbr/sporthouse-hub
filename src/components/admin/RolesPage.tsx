'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Trash2, AlertCircle, Check, Info, X } from 'lucide-react'
import {
  ACCESS_MODULES, ACCESS_GROUPS, ROLE_COLORS, levelOf,
  type AccessLevels, type ClientScope,
} from '@/lib/access-roles'

export interface RoleRow {
  id: string
  label: string
  color: string
  levels: AccessLevels
  sort_order: number
  user_count: number
  client_scope?: ClientScope
  requires_end_date?: boolean
}

// Eén scherm voor alle rollen tegelijk: onderdelen onder elkaar, rollen naast
// elkaar, per cel één niveau. Wat je hier opslaat geldt meteen voor iedereen
// met die rol — dat is het hele punt, dus het scherm zegt ook hoeveel mensen
// het raakt voor je op opslaan drukt.
export default function RolesPage() {
  const [roles,   setRoles]   = useState<RoleRow[]>([])
  const [draft,   setDraft]   = useState<Record<string, AccessLevels>>({})
  const [labels,  setLabels]  = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<Record<string, RoleSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [adding,  setAdding]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/roles')
    if (r.ok) {
      const rows: RoleRow[] = await r.json()
      setRoles(rows)
      setDraft(Object.fromEntries(rows.map(x => [x.id, { ...x.levels }])))
      setLabels(Object.fromEntries(rows.map(x => [x.id, x.label])))
      setSettings(Object.fromEntries(rows.map(x => [x.id, settingsOf(x)])))
    } else {
      setMessage({ kind: 'error', text: await r.text() })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const dirtyIds = roles
    .filter(r => {
      const d = draft[r.id]
      const levelsChanged = ACCESS_MODULES.some(m => levelOf(d, m) !== levelOf(r.levels, m))
      const set = settings[r.id] ?? settingsOf(r)
      const settingsChanged = set.client_scope !== settingsOf(r).client_scope || set.requires_end_date !== settingsOf(r).requires_end_date
      return levelsChanged || settingsChanged || (labels[r.id] ?? r.label).trim() !== r.label
    })
    .map(r => r.id)
  const affected = roles.filter(r => dirtyIds.includes(r.id)).reduce((n, r) => n + r.user_count, 0)

  function setLevel(roleId: string, moduleKey: string, level: string) {
    setDraft(prev => ({ ...prev, [roleId]: { ...prev[roleId], [moduleKey]: level } }))
    setMessage(null)
  }

  function setSetting(roleId: string, patch: Partial<RoleSettings>) {
    setSettings(prev => ({ ...prev, [roleId]: { ...prev[roleId], ...patch } }))
    setMessage(null)
  }

  function discard() {
    setDraft(Object.fromEntries(roles.map(x => [x.id, { ...x.levels }])))
    setLabels(Object.fromEntries(roles.map(x => [x.id, x.label])))
    setSettings(Object.fromEntries(roles.map(x => [x.id, settingsOf(x)])))
    setMessage(null)
  }

  async function save() {
    setSaving(true); setMessage(null)
    let updatedPeople = 0
    for (const id of dirtyIds) {
      const label = (labels[id] ?? '').trim()
      const r = await fetch(`/api/admin/roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels: draft[id], ...settings[id], ...(label ? { label } : {}) }),
      })
      if (!r.ok) {
        setMessage({ kind: 'error', text: await r.text() })
        setSaving(false)
        await load()
        return
      }
      updatedPeople += (await r.json()).updated ?? 0
    }
    setSaving(false)
    setMessage({
      kind: 'ok',
      text: updatedPeople > 0
        ? `Opgeslagen — ${updatedPeople} ${updatedPeople === 1 ? 'persoon is' : 'mensen zijn'} bijgewerkt. Volledig actief binnen het uur, of meteen na opnieuw inloggen.`
        : 'Opgeslagen.',
    })
    await load()
  }

  async function remove(id: string) {
    const r = await fetch(`/api/admin/roles/${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    if (!r.ok) { setMessage({ kind: 'error', text: await r.text() }); return }
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-zinc-600">
        <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 flex-shrink-0">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-lg font-semibold text-zinc-100">Rollen</h1>
          <p className="text-sm text-zinc-500">
            Kies per rol wat ze mogen. Elk niveau bevat alles van het niveau ervoor.
            Wie een rol heeft, volgt hem automatisch.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-200 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors flex-shrink-0">
          <Plus size={14} /> Nieuwe rol
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="flex items-start gap-2 px-3 py-3 bg-amber-950/30 border border-amber-900/40 rounded-lg max-w-xl">
          <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            Er zijn nog geen rollen. Staan migraties 0064 en 0065 al in de database?
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-zinc-800 rounded-xl">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 220 + roles.length * 150 }}>
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider w-[220px] sticky left-0 bg-zinc-950">
                  Onderdeel
                </th>
                {roles.map(r => (
                  <th key={r.id} className="px-2 py-2 text-left align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                      <input
                        value={labels[r.id] ?? r.label}
                        onChange={e => setLabels(prev => ({ ...prev, [r.id]: e.target.value }))}
                        aria-label={`Naam van rol ${r.label}`}
                        className="min-w-0 w-full bg-transparent text-sm font-semibold text-zinc-100 rounded px-1 py-0.5 border border-transparent hover:border-zinc-800 focus:border-zinc-600 focus:outline-none"
                        style={{ color: r.color }}
                      />
                      {r.user_count === 0 && (
                        confirmDelete === r.id ? (
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => remove(r.id)} className="text-[10px] font-medium text-red-400 hover:text-red-300">Verwijder</button>
                            <button onClick={() => setConfirmDelete(null)} aria-label="Annuleren" className="text-zinc-600 hover:text-zinc-400"><X size={11} /></button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDelete(r.id)} title="Rol verwijderen"
                            className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 size={12} />
                          </button>
                        )
                      )}
                    </div>
                    <p className="text-[10px] font-normal text-zinc-600 px-1 mt-0.5">
                      {r.user_count === 0 ? 'Niemand' : `${r.user_count} ${r.user_count === 1 ? 'persoon' : 'mensen'}`}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={roles.length + 1} className="px-4 pt-4 pb-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest sticky left-0">
                  Account
                </td>
              </tr>
              <SettingRow
                label="Klanten"
                hint="Alleen gekozen: deze rol ziet enkel de klanten die je per persoon aanvinkt — niets aangevinkt is niets."
                roles={roles}
                value={r => settings[r.id]?.client_scope ?? 'all'}
                original={r => settingsOf(r).client_scope}
                options={[{ key: 'all', label: 'Alle klanten' }, { key: 'chosen', label: 'Alleen gekozen' }]}
                onChange={(id, v) => setSetting(id, { client_scope: v as ClientScope })}
              />
              <SettingRow
                label="Einddatum verplicht"
                hint="Bij uitnodigen moet je een einddatum invullen; op die dag wordt het account automatisch verwijderd."
                roles={roles}
                value={r => (settings[r.id]?.requires_end_date ? 'ja' : 'nee')}
                original={r => (settingsOf(r).requires_end_date ? 'ja' : 'nee')}
                options={[{ key: 'nee', label: 'Nee' }, { key: 'ja', label: 'Ja' }]}
                onChange={(id, v) => setSetting(id, { requires_end_date: v === 'ja' })}
              />
              {ACCESS_GROUPS.map(group => (
                <GroupRows key={group} group={group} roles={roles} draft={draft} onChange={setLevel} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(dirtyIds.length > 0 || message) && (
        <div className="flex-shrink-0 mt-3 flex flex-wrap items-center gap-3">
          {message && (
            <p className={`text-sm flex items-center gap-1.5 ${message.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {message.kind === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
              {message.text}
            </p>
          )}
          {dirtyIds.length > 0 && (
            <>
              <p className="text-xs text-zinc-500">
                {dirtyIds.length} {dirtyIds.length === 1 ? 'rol' : 'rollen'} gewijzigd
                {affected > 0 && <> · raakt {affected} {affected === 1 ? 'persoon' : 'mensen'}</>}
              </p>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={discard} disabled={saving} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Ongedaan maken
                </button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: '#3A913F' }}>
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Opslaan
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {adding && (
        <NewRoleModal
          roles={roles}
          onClose={() => setAdding(false)}
          onCreated={async () => { setAdding(false); await load() }}
        />
      )}
    </div>
  )
}

interface RoleSettings {
  client_scope: ClientScope
  requires_end_date: boolean
}

function settingsOf(r: RoleRow): RoleSettings {
  return { client_scope: r.client_scope ?? 'all', requires_end_date: r.requires_end_date ?? false }
}

function SettingRow({ label, hint, roles, value, original, options, onChange }: {
  label: string
  hint: string
  roles: RoleRow[]
  value: (r: RoleRow) => string
  original: (r: RoleRow) => string
  options: { key: string; label: string }[]
  onChange: (roleId: string, value: string) => void
}) {
  return (
    <tr className="border-t border-zinc-900 hover:bg-zinc-900/40">
      <td className="px-4 py-1.5 sticky left-0 bg-zinc-950">
        <span className="flex items-center gap-1.5 text-zinc-300">
          {label}
          <span title={hint} className="text-zinc-600 cursor-help"><Info size={11} /></span>
        </span>
      </td>
      {roles.map(r => {
        const v = value(r)
        const changed = v !== original(r)
        return (
          <td key={r.id} className="px-2 py-1.5">
            <select value={v} onChange={e => onChange(r.id, e.target.value)} aria-label={`${label} voor ${r.label}`}
              className={`w-full px-2 py-1 rounded-md text-xs bg-zinc-900 border focus:outline-none transition-colors ${
                changed ? 'border-amber-600/70 text-amber-200' : v === options[0].key ? 'border-zinc-800 text-zinc-600' : 'border-zinc-700 text-zinc-200'
              }`}>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </td>
        )
      })}
    </tr>
  )
}

function GroupRows({ group, roles, draft, onChange }: {
  group: string
  roles: RoleRow[]
  draft: Record<string, AccessLevels>
  onChange: (roleId: string, moduleKey: string, level: string) => void
}) {
  const modules = ACCESS_MODULES.filter(m => m.group === group)
  return (
    <>
      <tr>
        <td colSpan={roles.length + 1} className="px-4 pt-4 pb-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest sticky left-0">
          {group}
        </td>
      </tr>
      {modules.map(m => (
        <tr key={m.key} className="border-t border-zinc-900 hover:bg-zinc-900/40">
          <td className="px-4 py-1.5 sticky left-0 bg-zinc-950">
            <span className="flex items-center gap-1.5 text-zinc-300">
              {m.label}
              {m.hint && (
                <span title={m.hint} className="text-zinc-600 cursor-help"><Info size={11} /></span>
              )}
            </span>
          </td>
          {roles.map(r => {
            const value = levelOf(draft[r.id], m)
            const changed = value !== levelOf(r.levels, m)
            const isLowest = value === m.levels[0].key
            return (
              <td key={r.id} className="px-2 py-1.5">
                <select
                  value={value}
                  onChange={e => onChange(r.id, m.key, e.target.value)}
                  aria-label={`${m.label} voor ${r.label}`}
                  className={`w-full px-2 py-1 rounded-md text-xs bg-zinc-900 border focus:outline-none transition-colors ${
                    changed ? 'border-amber-600/70 text-amber-200' : isLowest ? 'border-zinc-800 text-zinc-600' : 'border-zinc-700 text-zinc-200'
                  }`}
                >
                  {m.levels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

function NewRoleModal({ roles, onClose, onCreated }: { roles: RoleRow[]; onClose: () => void; onCreated: () => void }) {
  const [label,    setLabel]    = useState('')
  const [copyFrom, setCopyFrom] = useState(roles[0]?.id ?? '')
  const [color,    setColor]    = useState(ROLE_COLORS[roles.length % ROLE_COLORS.length])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) { setError('Geef de rol een naam.'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, color, copy_from: copyFrom || null }),
    })
    if (!r.ok) { setError(await r.text()); setSaving(false); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Nieuwe rol</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="text-zinc-600 hover:text-zinc-300"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Naam</label>
            <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="bijv. Video editor"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Begin vanaf</label>
            <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500">
              <option value="">Niets — alles uit</option>
              {roles.map(r => <option key={r.id} value={r.id}>Kopie van {r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Kleur</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Kleur ${c}`}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{ backgroundColor: c, outline: color === c ? '2px solid #e4e4e7' : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300">Annuleren</button>
          <button type="submit" disabled={saving}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#3A913F' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Aanmaken
          </button>
        </div>
      </form>
    </div>
  )
}
