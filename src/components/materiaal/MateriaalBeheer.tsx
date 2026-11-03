'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Loader2, Package, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react'
import SortableList from '@/components/materiaal/SortableList'
import KitsTab from '@/components/materiaal/KitsTab'
import { ColorDots, ErrorLine, Field, IconButton, PALETTE, PrimaryButton, ResponsiblePicker, StatusBadge, inputCls, send, type People } from '@/components/materiaal/ui'
import { kitByItem } from '@/lib/gear/kits'
import { responsibleName } from '@/lib/gear/responsible'
import type { GearBookingOptions, GearCatalog, GearCategory, GearItem } from '@/lib/gear/types'

// Beheer van de materiaalplanner: items (elk voorwerp), kits (zelf
// samengesteld, onderdelen verplaatsen) en categorieën. De status (defect,
// hersteld, …) wijzig je op de detailpagina van een item, zodat alles in het
// logboek komt.

type Tab = 'materiaal' | 'kits' | 'categorieen'

const TAB_LABEL: Record<Tab, string> = { materiaal: 'Materiaal', kits: 'Kits', categorieen: 'Categorieën' }

export default function MateriaalBeheer({ initialKitId }: { initialKitId: string | null }) {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [people, setPeople] = useState<People>({ clients: [], colleagues: [] })
  const [tab, setTab] = useState<Tab>(initialKitId ? 'kits' : 'materiaal')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const c = await send<GearCatalog>('/api/materiaal/catalog', 'GET')
      setCatalog(c)
      setCategoryId(id => id || c.categories[0]?.id || '')
    } catch (e) { setError(e instanceof Error ? e.message : 'Laden mislukt.') }
  }, [])

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET')
      .then(c => { setCatalog(c); setCategoryId(id => id || c.categories[0]?.id || '') })
      .catch(e => setError(e instanceof Error ? e.message : 'Laden mislukt.'))
    // Verantwoordelijke: een klant of een collega.
    send<GearBookingOptions>('/api/materiaal/options', 'GET')
      .then(o => setPeople({ clients: o.clients, colleagues: o.colleagues.map(c => ({ id: c.id, name: c.name })) }))
      .catch(() => {})
  }, [])

  if (!catalog) {
    return <div className="p-8">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
  }

  // Klanten die al verantwoordelijke zijn, staan ook in de keuzelijst, ook als
  // de beheerder die klant zelf niet ziet.
  const clientOptions = [...new Map([...catalog.clients, ...people.clients].map(c => [c.id, c])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  const patchCatalog = (fn: (c: GearCatalog) => GearCatalog) => setCatalog(c => (c ? fn(c) : c))

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
          <ChevronRight size={14} /><span className="text-zinc-200">Beheer</span>
        </div>

        <div className="flex p-0.5 mb-5 rounded-lg bg-zinc-950 border border-zinc-800 w-full sm:w-fit">
          {(Object.keys(TAB_LABEL) as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {error && <div className="mb-4"><ErrorLine>{error}</ErrorLine></div>}

        {tab === 'materiaal' && (
          <ItemsTab catalog={catalog} categoryId={categoryId} setCategoryId={setCategoryId}
            people={{ clients: clientOptions, colleagues: people.colleagues }} onChange={patchCatalog} onError={setError} />
        )}
        {tab === 'kits' && (
          <KitsTab catalog={catalog} people={{ clients: clientOptions, colleagues: people.colleagues }}
            initialKitId={initialKitId} onChange={patchCatalog} onReload={reload} onError={setError} />
        )}
        {tab === 'categorieen' && (
          <CategoriesTab catalog={catalog} onChange={patchCatalog} onError={setError}
            onOpen={id => { setCategoryId(id); setTab('materiaal') }} />
        )}
      </div>
    </div>
  )
}

// ─── Materiaal (items) ────────────────────────────────────────────────────────

function ItemsTab({ catalog, categoryId, setCategoryId, people, onChange, onError }: {
  catalog: GearCatalog
  categoryId: string
  setCategoryId: (id: string) => void
  people: People
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [count, setCount] = useState('1')
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const category = catalog.categories.find(c => c.id === categoryId)
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const clients = useMemo(() => new Map(catalog.clients.map(c => [c.id, c])), [catalog.clients])
  const items = useMemo(() => catalog.items.filter(i => i.category_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl')), [catalog.items, categoryId])
  const models = useMemo(() => [...new Set(catalog.items.map(i => i.model).filter((m): m is string => !!m))].sort(), [catalog.items])
  const names = bulk.split('\n').map(s => s.trim()).filter(Boolean)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : 'Er ging iets mis.') }
    setBusy(null)
  }

  function reorder(next: GearItem[]) {
    const previous = catalog.items
    const pos = new Map(next.map((i, n) => [i.id, n + 1]))
    onChange(c => ({ ...c, items: c.items.map(i => (pos.has(i.id) ? { ...i, sort_order: pos.get(i.id)! } : i)) }))
    run('order', async () => {
      try { await send('/api/materiaal/items', 'PATCH', { order: next.map(i => i.id) }) }
      catch (e) { onChange(c => ({ ...c, items: previous })); throw e }
    })
  }

  // Na "Model + aantal" kan een bestaand kaal item hernoemd zijn tot "#1":
  // daarom alles van de server opnieuw, niet alleen de nieuwe rijen.
  async function refreshItems() {
    const c = await send<GearCatalog>('/api/materiaal/catalog', 'GET')
    onChange(prev => ({ ...prev, items: c.items }))
  }

  function addModel() {
    if (!model.trim()) return
    run('model', async () => {
      await send('/api/materiaal/items', 'POST', { category_id: categoryId, model, count })
      await refreshItems()
      setModel(''); setCount('1')
    })
  }

  function addNames() {
    if (!names.length) return
    run('names', async () => {
      const created = await send<GearItem[]>('/api/materiaal/items', 'POST', { category_id: categoryId, names })
      onChange(c => ({ ...c, items: [...c.items, ...created] }))
      setBulk('')
    })
  }

  if (!catalog.categories.length) return <p className="py-6 text-center text-sm text-zinc-600">Maak eerst een categorie aan.</p>

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="Categorie">
        {catalog.categories.map(c => (
          <button key={c.id} role="tab" aria-selected={c.id === categoryId} onClick={() => { setCategoryId(c.id); setEditing(null) }}
            className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
            style={c.id === categoryId ? { backgroundColor: `${c.color}25`, border: `1px solid ${c.color}`, color: c.color } : { border: '1px solid #3f3f46', color: '#a1a1aa' }}>
            {c.name}
          </button>
        ))}
      </div>

      <SortableList items={items} onReorder={reorder} renderItem={item => editing === item.id ? (
        <ItemEditor item={item} catalog={catalog} people={people} onDone={() => setEditing(null)} onChange={onChange} onError={onError} />
      ) : (
        <div className="flex items-center gap-2">
          <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-zinc-100 truncate">{item.name}</span>
              {item.status !== 'ok' && <StatusBadge status={item.status} />}
            </div>
            <p className="text-[11px] text-zinc-500 truncate">
              {kitOf.get(item.id) && <span className="inline-flex items-center gap-1 mr-2"><Package size={10} />{kitOf.get(item.id)!.name}</span>}
              {item.serial_number && <span className="mr-2">S/N {item.serial_number}</span>}
              {responsibleName(item, clients) && <span className="inline-flex items-center gap-1 text-amber-400/90 mr-2"><UserRound size={10} />{responsibleName(item, clients)}</span>}
              {item.warning && <span className="text-amber-300/80">{item.warning}</span>}
            </p>
          </div>
          <Link href={`/materiaal/item/${item.id}`} className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5">Details</Link>
          <IconButton label={`${item.name} bewerken`} onClick={() => setEditing(item.id)}><Pencil size={12} /></IconButton>
        </div>
      )} />
      {items.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog niets in {category?.name}.</p>}

      <p className="section-label mt-6 mb-2">Toevoegen aan {category?.name}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
          <p className="text-xs text-zinc-400">Identieke voorwerpen, genummerd per model (bv. Sony batterij #17, #18).</p>
          <div className="flex gap-2">
            <input value={model} onChange={e => setModel(e.target.value)} list="gear-models" placeholder="Model, bv. Sony batterij"
              aria-label="Model" className={inputCls} />
            <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} aria-label="Aantal" className={`${inputCls} w-20`} />
          </div>
          <datalist id="gear-models">{models.map(m => <option key={m} value={m} />)}</datalist>
          <div className="flex justify-end">
            <PrimaryButton onClick={addModel} busy={busy === 'model'} disabled={!model.trim()}><Plus size={13} /> Toevoegen</PrimaryButton>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
          <p className="text-xs text-zinc-400">Verschillende voorwerpen: één naam per regel.</p>
          <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={3} aria-label="Nieuw materiaal, één per regel"
            placeholder={'bv.\nSony FX3 D\nMonitor Atomos Ninja'} className={`${inputCls} resize-y`} />
          <div className="flex justify-end">
            <PrimaryButton onClick={addNames} busy={busy === 'names'} disabled={!names.length}>
              <Plus size={13} /> {names.length > 1 ? `${names.length} toevoegen` : 'Toevoegen'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  )
}

function ItemEditor({ item, catalog, people, onDone, onChange, onError }: {
  item: GearItem
  catalog: GearCatalog
  people: People
  onDone: () => void
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
}) {
  const [f, setF] = useState({
    name: item.name, category_id: item.category_id, model: item.model ?? '', number: item.number ?? '',
    serial_number: item.serial_number ?? '', label_color: item.label_color ?? '', nd_size: item.nd_size ?? '',
    warning: item.warning ?? '', notes: item.notes ?? '',
    responsible_client_id: item.responsible_client_id, responsible_user_id: item.responsible_user_id,
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }))

  async function save() {
    setBusy(true); onError('')
    try {
      const updated = await send<GearItem>('/api/materiaal/items', 'PATCH', { id: item.id, ...f })
      onChange(c => ({ ...c, items: c.items.map(i => (i.id === item.id ? updated : i)) }))
      onDone()
    } catch (e) { onError(e instanceof Error ? e.message : 'Opslaan mislukt.') }
    setBusy(false)
  }

  async function remove() {
    if (!confirm(`"${item.name}" definitief verwijderen?`)) return
    setBusy(true); onError('')
    try {
      await send('/api/materiaal/items', 'DELETE', { id: item.id })
      onChange(c => ({ ...c, items: c.items.filter(i => i.id !== item.id), kits: c.kits.map(k => ({ ...k, item_ids: k.item_ids.filter(id => id !== item.id) })) }))
    } catch (e) { onError(e instanceof Error ? e.message : 'Verwijderen mislukt.') }
    setBusy(false)
  }

  return (
    <div className="space-y-3 py-1">
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2">
        <Field label="Naam"><input value={f.name} onChange={set('name')} className={inputCls} /></Field>
        <Field label="Categorie">
          <select value={f.category_id} onChange={set('category_id')} className={inputCls}>
            {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Model"><input value={f.model} onChange={set('model')} placeholder="bv. Sony batterij" className={inputCls} /></Field>
        <Field label="Nummer"><input value={f.number} onChange={set('number')} placeholder="bv. #3" className={inputCls} /></Field>
        <Field label="Serienummer"><input value={f.serial_number} onChange={set('serial_number')} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Labelkleur"><input value={f.label_color} onChange={set('label_color')} placeholder="bv. groen" className={inputCls} /></Field>
        <Field label="ND-filter"><input value={f.nd_size} onChange={set('nd_size')} placeholder="bv. 77" className={inputCls} /></Field>
      </div>
      <Field label="Waarschuwing (staat overal waar je boekt)"><input value={f.warning} onChange={set('warning')} placeholder="bv. Enkel MF of foto" className={inputCls} /></Field>
      <Field label="Notities"><textarea value={f.notes} onChange={set('notes')} rows={2} className={`${inputCls} resize-y`} /></Field>
      <Field label="Verantwoordelijke (anders die van de kit)">
        <ResponsiblePicker people={people}
          value={{ client: f.responsible_client_id, user: f.responsible_user_id, name: item.responsible_name }}
          onChange={v => setF(prev => ({ ...prev, ...v }))} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={remove} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 disabled:opacity-50">
          <Trash2 size={12} /> Verwijderen
        </button>
        <span className="ml-auto text-[11px] text-zinc-500">Status: <Link href={`/materiaal/item/${item.id}`} className="underline hover:text-zinc-300">op de detailpagina</Link></span>
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">Sluiten</button>
        <PrimaryButton onClick={save} busy={busy} disabled={!f.name.trim()}><Check size={12} /> Opslaan</PrimaryButton>
      </div>
    </div>
  )
}

// ─── Categorieën ──────────────────────────────────────────────────────────────

function CategoriesTab({ catalog, onChange, onError, onOpen }: {
  catalog: GearCatalog
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
  onOpen: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of catalog.items) m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1)
    return m
  }, [catalog.items])

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : 'Er ging iets mis.') }
    setBusy(null)
  }

  function reorder(next: GearCategory[]) {
    const previous = catalog.categories
    onChange(c => ({ ...c, categories: next.map((cat, i) => ({ ...cat, sort_order: i + 1 })) }))
    run('order', async () => {
      try { await send('/api/materiaal/categories', 'PATCH', { order: next.map(c => c.id) }) }
      catch (e) { onChange(c => ({ ...c, categories: previous })); throw e }
    })
  }

  function save(cat: GearCategory, fields: Partial<GearCategory>) {
    run(cat.id, async () => {
      const updated = await send<GearCategory>('/api/materiaal/categories', 'PATCH', { id: cat.id, ...fields })
      onChange(c => ({ ...c, categories: c.categories.map(x => (x.id === cat.id ? updated : x)) }))
      setEditing(null)
    })
  }

  function add() {
    if (!newName.trim()) return
    run('new', async () => {
      const created = await send<GearCategory>('/api/materiaal/categories', 'POST', { name: newName, color: newColor })
      onChange(c => ({ ...c, categories: [...c.categories, created] }))
      setNewName('')
    })
  }

  function remove(cat: GearCategory) {
    if (!confirm(`Categorie "${cat.name}" verwijderen?`)) return
    run(cat.id, async () => {
      await send('/api/materiaal/categories', 'DELETE', { id: cat.id })
      onChange(c => ({ ...c, categories: c.categories.filter(x => x.id !== cat.id) }))
    })
  }

  return (
    <>
      <p className="text-xs text-zinc-500 mb-3">Categorieën zijn de groepen in het raster. Sleep aan het greepje om de volgorde te wijzigen.</p>
      <SortableList items={catalog.categories} onReorder={reorder} renderItem={cat => (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            {editing === cat.id ? (
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} aria-label="Naam van de categorie"
                onKeyDown={e => { if (e.key === 'Enter') save(cat, { name: editName }); if (e.key === 'Escape') setEditing(null) }}
                className="flex-1 min-w-0 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none" />
            ) : (
              <button onClick={() => onOpen(cat.id)} className="flex-1 min-w-0 text-left text-sm text-zinc-100 truncate hover:underline">{cat.name}</button>
            )}
            <span className="text-[11px] text-zinc-500 flex-shrink-0">{counts.get(cat.id) ?? 0} stuks</span>
            {busy === cat.id && <Loader2 size={13} className="animate-spin text-zinc-500" />}
            {editing === cat.id ? (
              <>
                <IconButton label="Opslaan" onClick={() => save(cat, { name: editName })}><Check size={13} className="text-emerald-400" /></IconButton>
                <IconButton label="Annuleren" onClick={() => setEditing(null)}><X size={13} /></IconButton>
              </>
            ) : (
              <IconButton label={`${cat.name} bewerken`} onClick={() => { setEditing(cat.id); setEditName(cat.name) }}><Pencil size={12} /></IconButton>
            )}
            <IconButton label={`${cat.name} verwijderen`} danger onClick={() => remove(cat)}><Trash2 size={12} /></IconButton>
          </div>
          {editing === cat.id && <ColorDots value={cat.color} onChange={color => save(cat, { color, name: editName })} size={14} />}
        </div>
      )} />
      {catalog.categories.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen categorieën.</p>}

      <p className="section-label mt-6 mb-2">Categorie toevoegen</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="Naam, bv. AUDIO" aria-label="Naam van de nieuwe categorie" className={inputCls} />
          <PrimaryButton onClick={add} busy={busy === 'new'} disabled={!newName.trim()}><Plus size={13} /> Toevoegen</PrimaryButton>
        </div>
        <ColorDots value={newColor} onChange={setNewColor} />
      </div>
    </>
  )
}
