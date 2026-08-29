'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Loader2, Plus, Trash2, Wrench, Check } from 'lucide-react'

export interface AdminEquipmentItem {
  id: string
  name: string
  category: string
  description?: string
  is_broken?: boolean
  broken_note?: string | null
}

export interface AdminProject {
  id: string
  name: string
  color: string
  show_in_planner: boolean
  sort_order: number
}

const PROJECT_COLORS = ['#c2410c', '#6d28d9', '#0891b2', '#059669', '#ca8a04', '#be185d', '#2563eb', '#52525b']

interface Props {
  equipment: AdminEquipmentItem[]
  projects: AdminProject[]
  onClose: () => void
  onEquipmentChange: (item: AdminEquipmentItem) => void
  onProjectsChange: (projects: AdminProject[]) => void
}

// Eén plek voor de dingen die alleen een beheerder doet: materiaal defect
// melden of herstellen, en de vaste projecten beheren waaronder gereserveerd
// kan worden.
export default function EquipmentAdminPanel({
  equipment, projects, onClose, onEquipmentChange, onProjectsChange,
}: Props) {
  const [tab, setTab] = useState<'defect' | 'projecten'>('defect')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const broken = useMemo(() => equipment.filter(e => e.is_broken), [equipment])
  const working = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pool = equipment.filter(e => !e.is_broken)
    if (!q) return pool
    return pool.filter(e => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  }, [equipment, search])

  async function setBroken(item: AdminEquipmentItem, is_broken: boolean, note?: string) {
    setBusyId(item.id); setError('')
    try {
      const res = await fetch('/api/equipment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_broken, broken_note: note ?? null }),
      })
      if (!res.ok) throw new Error(await res.text())
      onEquipmentChange(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setBusyId(null)
  }

  async function addProject() {
    if (!newName.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/equipment-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor, show_in_planner: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      onProjectsChange([...projects, await res.json()])
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toevoegen mislukt')
    }
    setCreating(false)
  }

  async function patchProject(p: AdminProject, fields: Partial<AdminProject>) {
    setBusyId(p.id); setError('')
    try {
      const res = await fetch('/api/equipment-projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, ...fields }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      onProjectsChange(projects.map(x => x.id === p.id ? updated : x))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setBusyId(null)
  }

  async function removeProject(p: AdminProject) {
    if (!confirm(`"${p.name}" verwijderen uit de vaste projecten?\n\nBestaande reservaties houden de naam als vrije tekst.`)) return
    setBusyId(p.id)
    await fetch('/api/equipment-projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    })
    onProjectsChange(projects.filter(x => x.id !== p.id))
    setBusyId(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Beheer materiaalplanning</h2>
          <button onClick={onClose} aria-label="Sluiten" className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 w-full sm:w-fit overflow-x-auto">
            {(['defect', 'projecten'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                }`}
              >
                {t === 'defect' ? `Defect materiaal${broken.length ? ` (${broken.length})` : ''}` : 'Vaste projecten'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'defect' ? (
            <>
              {broken.length > 0 && (
                <div className="mb-5">
                  <p className="section-label mb-2">Gemeld als defect</p>
                  <div className="space-y-1.5">
                    {broken.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-red-900/40 bg-red-950/20">
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-100 truncate">{item.name}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {item.broken_note || 'Geen reden genoteerd'}
                          </p>
                        </div>
                        <button
                          onClick={() => setBroken(item, false)}
                          disabled={busyId === item.id}
                          className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 disabled:opacity-50"
                        >
                          {busyId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Hersteld
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="section-label mb-2">Materiaal defect melden</p>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Zoek materiaal…"
                className="w-full mb-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <div className="space-y-1">
                {working.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-zinc-800/40">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{item.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-600 truncate">{item.category}</p>
                    </div>
                    <button
                      onClick={() => {
                        const note = prompt(`Wat is er mis met "${item.name}"?`, '')
                        if (note === null) return
                        setBroken(item, true, note)
                      }}
                      disabled={busyId === item.id}
                      className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50"
                    >
                      {busyId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                      Defect
                    </button>
                  </div>
                ))}
                {working.length === 0 && <p className="py-6 text-center text-sm text-zinc-600">Niets gevonden.</p>}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-3">
                Vaste projecten verschijnen als keuze bij het reserveren. Staat &ldquo;in planner&rdquo; aan, dan toont
                het raster de projectnaam in plaats van de persoon — de naam blijft wel in de reservatie staan.
              </p>

              <div className="space-y-1.5 mb-5">
                {projects.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate">{p.name}</span>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {PROJECT_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => patchProject(p, { color: c })}
                          aria-label={`Kleur ${c}`}
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: c, border: p.color === c ? '2px solid #fff' : '2px solid transparent' }}
                        />
                      ))}
                    </div>

                    <button
                      onClick={() => patchProject(p, { show_in_planner: !p.show_in_planner })}
                      disabled={busyId === p.id}
                      title="Tonen in het raster in plaats van de persoon"
                      className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        p.show_in_planner
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-700 text-zinc-500'
                      }`}
                    >
                      in planner
                    </button>

                    <button
                      onClick={() => removeProject(p)}
                      disabled={busyId === p.id}
                      aria-label={`${p.name} verwijderen`}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {projects.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen vaste projecten.</p>}
              </div>

              <p className="section-label mb-2">Project toevoegen</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addProject() }}
                  placeholder="Naam, bv. FoS"
                  className="flex-1 min-w-0 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <div className="flex items-center gap-1">
                  {PROJECT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      aria-label={`Kleur ${c}`}
                      className="w-5 h-5 rounded-full"
                      style={{ backgroundColor: c, border: newColor === c ? '2px solid #fff' : '2px solid transparent' }}
                    />
                  ))}
                </div>
                <button
                  onClick={addProject}
                  disabled={creating || !newName.trim()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: '#3A913F' }}
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Toevoegen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
