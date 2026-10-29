'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Loader2, Plus, Trash2, Wrench, Check, Pencil, UserRound } from 'lucide-react'
import SortableList from '@/components/equipment/SortableList'
import {
  DEFAULT_OWNER_NOTE, PALETTE,
  type EquipmentItem, type EquipmentCategory, type EquipmentProject,
} from '@/components/equipment/types'

export type AdminTab = 'categorieen' | 'materiaal' | 'defect' | 'projecten'

interface Props {
  equipment: EquipmentItem[]
  categories: EquipmentCategory[]
  projects: EquipmentProject[]
  // Namen om uit te kiezen als verantwoordelijke (collega's en projecten).
  people: string[]
  initialTab?: AdminTab
  initialCategory?: string
  onClose: () => void
  onEquipmentChange: (items: EquipmentItem[]) => void
  onCategoriesChange: (categories: EquipmentCategory[]) => void
  onProjectsChange: (projects: EquipmentProject[]) => void
}

const TAB_LABELS: Record<AdminTab, string> = {
  categorieen: 'Categorieën',
  materiaal:   'Materiaal',
  defect:      'Defect',
  projecten:   'Vaste projecten',
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()) || 'Opslaan mislukt')
  return res.status === 204 ? null : res.json()
}

const inputCls = 'w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'
const labelCls = 'block text-[10px] text-zinc-500 uppercase tracking-wider mb-1'

function ColorDots({ value, onChange, size = 16 }: { value: string; onChange: (c: string) => void; size?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Kleur ${c}`}
          className="rounded-full flex-shrink-0"
          style={{ width: size, height: size, backgroundColor: c, border: value === c ? '2px solid #fff' : '2px solid transparent' }}
        />
      ))}
    </div>
  )
}

// Alles wat de materiaalplanning inricht, op één plek: categorieën en hun
// volgorde, het materiaal zelf (met verantwoordelijke), defect melden en de
// vaste projecten.
export default function EquipmentAdminPanel({
  equipment, categories, projects, people, initialTab = 'categorieen', initialCategory,
  onClose, onEquipmentChange, onCategoriesChange, onProjectsChange,
}: Props) {
  const [tab, setTab]       = useState<AdminTab>(initialTab)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError]   = useState('')
  const [openCategory, setOpenCategory] = useState(initialCategory ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(id: string | null, fn: () => Promise<void>) {
    setBusyId(id); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Er ging iets mis') }
    setBusyId(null)
  }

  const brokenCount = equipment.filter(e => e.is_broken).length

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
          <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 w-full overflow-x-auto">
            {(Object.keys(TAB_LABELS) as AdminTab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                }`}
              >
                {TAB_LABELS[t]}{t === 'defect' && brokenCount ? ` (${brokenCount})` : ''}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/40 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'categorieen' && (
            <CategoriesTab
              categories={categories} equipment={equipment} busyId={busyId} run={run}
              onCategoriesChange={onCategoriesChange} onEquipmentChange={onEquipmentChange}
              onOpenCategory={name => { setTab('materiaal'); setOpenCategory(name) }}
            />
          )}
          {tab === 'materiaal' && (
            <MaterialTab
              categories={categories} equipment={equipment} people={people} busyId={busyId} run={run}
              category={openCategory} setCategory={setOpenCategory}
              onEquipmentChange={onEquipmentChange}
            />
          )}
          {tab === 'defect' && (
            <DefectTab equipment={equipment} busyId={busyId} run={run} onEquipmentChange={onEquipmentChange} />
          )}
          {tab === 'projecten' && (
            <ProjectsTab projects={projects} busyId={busyId} run={run} onProjectsChange={onProjectsChange} />
          )}
        </div>
      </div>
    </div>
  )
}

type Run = (id: string | null, fn: () => Promise<void>) => Promise<void>

// ─── Categorieën ──────────────────────────────────────────────────────────────

function CategoriesTab({ categories, equipment, busyId, run, onCategoriesChange, onEquipmentChange, onOpenCategory }: {
  categories: EquipmentCategory[]
  equipment: EquipmentItem[]
  busyId: string | null
  run: Run
  onCategoriesChange: (c: EquipmentCategory[]) => void
  onEquipmentChange: (e: EquipmentItem[]) => void
  onOpenCategory: (name: string) => void
}) {
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [editing, setEditing]   = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of equipment) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return m
  }, [equipment])

  function reorder(next: EquipmentCategory[]) {
    const previous = categories
    onCategoriesChange(next.map((c, i) => ({ ...c, sort_order: i + 1 })))
    run(null, async () => {
      try { await send('/api/equipment-categories', 'PATCH', { order: next.map(c => c.id) }) }
      catch (e) { onCategoriesChange(previous); throw e }
    })
  }

  function patch(cat: EquipmentCategory, fields: Partial<EquipmentCategory>) {
    run(cat.id, async () => {
      const updated: EquipmentCategory = await send('/api/equipment-categories', 'PATCH', { id: cat.id, ...fields })
      onCategoriesChange(categories.map(c => c.id === cat.id ? updated : c))
      // Hernoemd: het materiaal verhuist op de server mee, hier ook.
      if (updated.name !== cat.name) {
        onEquipmentChange(equipment.map(e => e.category === cat.name ? { ...e, category: updated.name } : e))
      }
      setEditing(null)
    })
  }

  function add() {
    if (!newName.trim()) return
    run('new', async () => {
      const created: EquipmentCategory = await send('/api/equipment-categories', 'POST', { name: newName, color: newColor })
      onCategoriesChange([...categories, created])
      setNewName('')
    })
  }

  function remove(cat: EquipmentCategory) {
    if (!confirm(`Categorie "${cat.name}" verwijderen?`)) return
    run(cat.id, async () => {
      await send('/api/equipment-categories', 'DELETE', { id: cat.id })
      onCategoriesChange(categories.filter(c => c.id !== cat.id))
    })
  }

  return (
    <>
      <p className="text-xs text-zinc-500 mb-3">
        Categorieën zijn de kolomgroepen in het raster. Sleep aan het greepje om de volgorde te wijzigen.
      </p>

      <SortableList
        items={categories}
        onReorder={reorder}
        renderItem={cat => (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              {editing === cat.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') patch(cat, { name: editName })
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="flex-1 min-w-0 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => onOpenCategory(cat.name)}
                  title="Materiaal in deze categorie bekijken"
                  className="flex-1 min-w-0 text-left text-sm text-zinc-100 truncate hover:underline"
                >
                  {cat.name}
                </button>
              )}
              <span className="text-[11px] text-zinc-500 flex-shrink-0">{counts.get(cat.name) ?? 0} stuks</span>
              {busyId === cat.id && <Loader2 size={13} className="animate-spin text-zinc-500" />}
              {editing === cat.id ? (
                <button onClick={() => patch(cat, { name: editName })} aria-label="Opslaan"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-400 hover:bg-zinc-800">
                  <Check size={13} />
                </button>
              ) : (
                <button onClick={() => { setEditing(cat.id); setEditName(cat.name) }} aria-label={`${cat.name} bewerken`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
                  <Pencil size={12} />
                </button>
              )}
              <button onClick={() => remove(cat)} aria-label={`${cat.name} verwijderen`}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800">
                <Trash2 size={12} />
              </button>
            </div>
            {editing === cat.id && (
              <ColorDots value={cat.color} onChange={c => patch(cat, { color: c, name: editName })} size={14} />
            )}
          </div>
        )}
      />
      {categories.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen categorieën.</p>}

      <p className="section-label mt-5 mb-2">Categorie toevoegen</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="Naam, bv. AUDIO"
            className={inputCls}
          />
          <button
            onClick={add}
            disabled={busyId === 'new' || !newName.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: '#3A913F' }}
          >
            {busyId === 'new' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Toevoegen
          </button>
        </div>
        <ColorDots value={newColor} onChange={setNewColor} />
      </div>
    </>
  )
}

// ─── Materiaal ────────────────────────────────────────────────────────────────

function MaterialTab({ categories, equipment, people, busyId, run, category, setCategory, onEquipmentChange }: {
  categories: EquipmentCategory[]
  equipment: EquipmentItem[]
  people: string[]
  busyId: string | null
  run: Run
  category: string
  setCategory: (c: string) => void
  onEquipmentChange: (e: EquipmentItem[]) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [bulk, setBulk]       = useState('')

  const current = category || categories[0]?.name || ''
  const items = useMemo(
    () => equipment
      .filter(e => e.category === current)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [equipment, current]
  )
  const names = bulk.split('\n').map(s => s.trim()).filter(Boolean)

  function reorder(next: EquipmentItem[]) {
    const previous = equipment
    const order = new Map(next.map((e, i) => [e.id, i + 1]))
    onEquipmentChange(equipment.map(e => order.has(e.id) ? { ...e, sort_order: order.get(e.id) } : e))
    run(null, async () => {
      try { await send('/api/equipment', 'PATCH', { order: next.map(e => e.id), category: current }) }
      catch (e) { onEquipmentChange(previous); throw e }
    })
  }

  function addBulk() {
    if (!names.length || !current) return
    run('bulk', async () => {
      const created: EquipmentItem[] = await send('/api/equipment', 'POST', { names, category: current })
      onEquipmentChange([...equipment, ...created])
      setBulk('')
    })
  }

  function save(item: EquipmentItem, fields: Partial<EquipmentItem>) {
    run(item.id, async () => {
      const updated: EquipmentItem = await send('/api/equipment', 'PATCH', { id: item.id, ...fields })
      onEquipmentChange(equipment.map(e => e.id === item.id ? updated : e))
      setEditing(null)
    })
  }

  function remove(item: EquipmentItem) {
    if (!confirm(`"${item.name}" definitief verwijderen?`)) return
    run(item.id, async () => {
      await send('/api/equipment', 'DELETE', { id: item.id })
      onEquipmentChange(equipment.filter(e => e.id !== item.id))
    })
  }

  if (!categories.length) {
    return <p className="py-6 text-center text-sm text-zinc-600">Maak eerst een categorie aan.</p>
  }

  const color = categories.find(c => c.name === current)?.color ?? '#3A913F'

  return (
    <>
      <label className={labelCls}>Categorie</label>
      <select value={current} onChange={e => { setCategory(e.target.value); setEditing(null) }} className={`${inputCls} mb-3`}>
        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>

      <datalist id="equipment-owner-options">
        {people.map(p => <option key={p} value={p} />)}
      </datalist>

      <SortableList
        items={items}
        onReorder={reorder}
        renderItem={item => editing === item.id ? (
          <MaterialEditor
            item={item} categories={categories} busy={busyId === item.id}
            onCancel={() => setEditing(null)} onSave={fields => save(item, fields)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${item.is_broken ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{item.name}</p>
              {(item.owner || item.description) && (
                <p className="text-[11px] text-zinc-500 truncate">
                  {item.owner && <span className="inline-flex items-center gap-1 text-amber-400/90 mr-2"><UserRound size={10} />{item.owner}</span>}
                  {item.description}
                </p>
              )}
            </div>
            {busyId === item.id && <Loader2 size={13} className="animate-spin text-zinc-500" />}
            <button onClick={() => setEditing(item.id)} aria-label={`${item.name} bewerken`}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
              <Pencil size={12} />
            </button>
            <button onClick={() => remove(item)} aria-label={`${item.name} verwijderen`}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      />
      {items.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog niets in {current}.</p>}

      <p className="section-label mt-5 mb-2">Toevoegen aan {current}</p>
      <textarea
        value={bulk}
        onChange={e => setBulk(e.target.value)}
        rows={3}
        placeholder={'Eén stuk per regel, bv.\nSony FX3\nSony FX3 #2'}
        className={`${inputCls} resize-y`}
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={addBulk}
          disabled={busyId === 'bulk' || !names.length}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: '#3A913F' }}
        >
          {busyId === 'bulk' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {names.length > 1 ? `${names.length} stuks toevoegen` : 'Toevoegen'}
        </button>
      </div>
    </>
  )
}

function MaterialEditor({ item, categories, busy, onCancel, onSave }: {
  item: EquipmentItem
  categories: EquipmentCategory[]
  busy: boolean
  onCancel: () => void
  onSave: (fields: Partial<EquipmentItem>) => void
}) {
  const [name, setName]               = useState(item.name)
  const [category, setCategory]       = useState(item.category)
  const [description, setDescription] = useState(item.description ?? '')
  const [owner, setOwner]             = useState(item.owner ?? '')
  const [ownerNote, setOwnerNote]     = useState(item.owner_note ?? '')

  return (
    <div className="space-y-3 py-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Naam</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Categorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Inhoud / omschrijving</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-2">
        <div>
          <label className={labelCls}>Vaste verantwoordelijke <span className="normal-case text-zinc-600">(leeg = van iedereen)</span></label>
          <input
            value={owner}
            onChange={e => setOwner(e.target.value)}
            list="equipment-owner-options"
            placeholder="bv. De Spor of een collega"
            className={inputCls}
          />
        </div>
        {owner.trim() && (
          <div>
            <label className={labelCls}>Melding bij reserveren</label>
            <input
              value={ownerNote}
              onChange={e => setOwnerNote(e.target.value)}
              placeholder={DEFAULT_OWNER_NOTE}
              className={inputCls}
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">Annuleren</button>
        <button
          onClick={() => onSave({ name, category, description, owner, owner_note: ownerNote })}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: '#3A913F' }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Opslaan
        </button>
      </div>
    </div>
  )
}

// ─── Defect ───────────────────────────────────────────────────────────────────

function DefectTab({ equipment, busyId, run, onEquipmentChange }: {
  equipment: EquipmentItem[]
  busyId: string | null
  run: Run
  onEquipmentChange: (e: EquipmentItem[]) => void
}) {
  const [search, setSearch] = useState('')

  const broken = useMemo(() => equipment.filter(e => e.is_broken), [equipment])
  const working = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pool = equipment.filter(e => !e.is_broken)
    if (!q) return pool
    return pool.filter(e => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  }, [equipment, search])

  function setBroken(item: EquipmentItem, is_broken: boolean, note?: string) {
    run(item.id, async () => {
      const updated: EquipmentItem = await send('/api/equipment', 'PATCH', { id: item.id, is_broken, broken_note: note ?? null })
      onEquipmentChange(equipment.map(e => e.id === item.id ? updated : e))
    })
  }

  return (
    <>
      {broken.length > 0 && (
        <div className="mb-5">
          <p className="section-label mb-2">Gemeld als defect</p>
          <div className="space-y-1.5">
            {broken.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-red-900/40 bg-red-950/20">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100 truncate">{item.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{item.broken_note || 'Geen reden genoteerd'}</p>
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
      <p className="text-xs text-zinc-500 mb-2">Defect materiaal verdwijnt uit het raster en kan niet gereserveerd worden.</p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek materiaal…" className={`${inputCls} mb-2`} />
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
  )
}

// ─── Vaste projecten ──────────────────────────────────────────────────────────

function ProjectsTab({ projects, busyId, run, onProjectsChange }: {
  projects: EquipmentProject[]
  busyId: string | null
  run: Run
  onProjectsChange: (p: EquipmentProject[]) => void
}) {
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState(PALETTE[5])
  const [colorOpen, setColorOpen] = useState<string | null>(null)

  function reorder(next: EquipmentProject[]) {
    const previous = projects
    onProjectsChange(next.map((p, i) => ({ ...p, sort_order: i + 1 })))
    run(null, async () => {
      try { await send('/api/equipment-projects', 'PATCH', { order: next.map(p => p.id) }) }
      catch (e) { onProjectsChange(previous); throw e }
    })
  }

  function patch(p: EquipmentProject, fields: Partial<EquipmentProject>) {
    run(p.id, async () => {
      const updated: EquipmentProject = await send('/api/equipment-projects', 'PATCH', { id: p.id, ...fields })
      onProjectsChange(projects.map(x => x.id === p.id ? updated : x))
    })
  }

  function add() {
    if (!newName.trim()) return
    run('new', async () => {
      const created: EquipmentProject = await send('/api/equipment-projects', 'POST', { name: newName, color: newColor, show_in_planner: true })
      onProjectsChange([...projects, created])
      setNewName('')
    })
  }

  function remove(p: EquipmentProject) {
    if (!confirm(`"${p.name}" verwijderen uit de vaste projecten?\n\nBestaande reservaties houden de naam als vrije tekst.`)) return
    run(p.id, async () => {
      await send('/api/equipment-projects', 'DELETE', { id: p.id })
      onProjectsChange(projects.filter(x => x.id !== p.id))
    })
  }

  return (
    <>
      <p className="text-xs text-zinc-500 mb-3">
        Vaste projecten verschijnen als keuze bij het reserveren. Staat &ldquo;in planner&rdquo; aan, dan toont
        het raster de projectnaam in plaats van de persoon — de naam blijft wel in de reservatie staan.
      </p>

      <SortableList
        items={projects}
        onReorder={reorder}
        renderItem={p => (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setColorOpen(colorOpen === p.id ? null : p.id)}
                aria-label="Kleur kiezen"
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate">{p.name}</span>
              {busyId === p.id && <Loader2 size={13} className="animate-spin text-zinc-500" />}
              <button
                onClick={() => patch(p, { show_in_planner: !p.show_in_planner })}
                disabled={busyId === p.id}
                title="Tonen in het raster in plaats van de persoon"
                className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  p.show_in_planner ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 text-zinc-500'
                }`}
              >
                in planner
              </button>
              <button onClick={() => remove(p)} disabled={busyId === p.id} aria-label={`${p.name} verwijderen`}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800">
                <Trash2 size={12} />
              </button>
            </div>
            {colorOpen === p.id && <ColorDots value={p.color} onChange={c => { patch(p, { color: c }); setColorOpen(null) }} size={14} />}
          </div>
        )}
      />
      {projects.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen vaste projecten.</p>}

      <p className="section-label mt-5 mb-2">Project toevoegen</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="Naam, bv. FoS"
            className={inputCls}
          />
          <button
            onClick={add}
            disabled={busyId === 'new' || !newName.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: '#3A913F' }}
          >
            {busyId === 'new' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Toevoegen
          </button>
        </div>
        <ColorDots value={newColor} onChange={setNewColor} />
      </div>
    </>
  )
}
