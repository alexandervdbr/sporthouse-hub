'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Loader2, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react'
import SortableList from '@/components/materiaal/SortableList'
import { ACCENT, ColorDots, ErrorLine, PALETTE, StatusBadge, inputCls, labelCls, send } from '@/components/materiaal/ui'
import type { GearCatalog, GearCategory, GearClientRef, GearUnit, GearUnitContent } from '@/lib/gear/types'

// Beheer van de materiaalplanner: categorieën, materiaal en de inhoud van
// kits. Alles is te slepen. De status (defect, hersteld, …) wijzig je op de
// detailpagina van een stuk, zodat elke wijziging in het logboek komt.

type Tab = 'materiaal' | 'categorieen'

export default function MateriaalBeheer() {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [clients, setClients] = useState<GearClientRef[]>([])
  const [tab, setTab] = useState<Tab>('materiaal')
  const [categoryId, setCategoryId] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET')
      .then(c => { setCatalog(c); setCategoryId(id => id || c.categories[0]?.id || '') })
      .catch(e => setError(e.message))
    // Vaste houders zijn klanten (Friends of Sports, Sporting Hasselt, …).
    send<GearClientRef[]>('/api/clients', 'GET').then(setClients).catch(() => {})
  }, [])

  if (!catalog) {
    return (
      <div className="p-8">
        {error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}
      </div>
    )
  }

  // Klanten die al als houder gekozen zijn, staan ook in de lijst, ook als
  // de beheerder die klant zelf niet in zijn klantenlijst ziet.
  const holderOptions = [...new Map([...catalog.holders, ...clients].map(c => [c.id, c])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))

  const patchCatalog = (fn: (c: GearCatalog) => GearCatalog) => setCatalog(c => (c ? fn(c) : c))

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
          <ChevronRight size={14} />
          <span className="text-zinc-200">Beheer</span>
        </div>

        <div className="flex p-0.5 mb-5 rounded-lg bg-zinc-950 border border-zinc-800 w-full sm:w-fit">
          {(['materiaal', 'categorieen'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
            >
              {t === 'materiaal' ? 'Materiaal' : 'Categorieën'}
            </button>
          ))}
        </div>

        {error && <div className="mb-4"><ErrorLine>{error}</ErrorLine></div>}

        {tab === 'categorieen' ? (
          <CategoriesTab
            catalog={catalog}
            onChange={patchCatalog}
            onError={setError}
            onOpen={id => { setCategoryId(id); setTab('materiaal') }}
          />
        ) : (
          <UnitsTab
            catalog={catalog}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            holderOptions={holderOptions}
            onChange={patchCatalog}
            onError={setError}
          />
        )}
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
    for (const u of catalog.units) m.set(u.category_id, (m.get(u.category_id) ?? 0) + 1)
    return m
  }, [catalog.units])

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

      <SortableList
        items={catalog.categories}
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
                    if (e.key === 'Enter') save(cat, { name: editName })
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  aria-label="Naam van de categorie"
                  className="flex-1 min-w-0 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none"
                />
              ) : (
                <button onClick={() => onOpen(cat.id)} className="flex-1 min-w-0 text-left text-sm text-zinc-100 truncate hover:underline">
                  {cat.name}
                </button>
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
        )}
      />
      {catalog.categories.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog geen categorieën.</p>}

      <p className="section-label mt-6 mb-2">Categorie toevoegen</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="Naam, bv. AUDIO"
            aria-label="Naam van de nieuwe categorie"
            className={inputCls}
          />
          <PrimaryButton onClick={add} busy={busy === 'new'} disabled={!newName.trim()}><Plus size={13} /> Toevoegen</PrimaryButton>
        </div>
        <ColorDots value={newColor} onChange={setNewColor} />
      </div>
    </>
  )
}

// ─── Materiaal ────────────────────────────────────────────────────────────────

function UnitsTab({ catalog, categoryId, setCategoryId, holderOptions, onChange, onError }: {
  catalog: GearCatalog
  categoryId: string
  setCategoryId: (id: string) => void
  holderOptions: GearClientRef[]
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const category = catalog.categories.find(c => c.id === categoryId)
  const units = useMemo(
    () => catalog.units
      .filter(u => u.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl')),
    [catalog.units, categoryId]
  )
  const holderName = (id: string | null) => (id ? holderOptions.find(c => c.id === id)?.name ?? 'onbekende klant' : null)
  const names = bulk.split('\n').map(s => s.trim()).filter(Boolean)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : 'Er ging iets mis.') }
    setBusy(null)
  }

  function reorder(next: GearUnit[]) {
    const previous = catalog.units
    const pos = new Map(next.map((u, i) => [u.id, i + 1]))
    onChange(c => ({ ...c, units: c.units.map(u => (pos.has(u.id) ? { ...u, sort_order: pos.get(u.id)! } : u)) }))
    run('order', async () => {
      try { await send('/api/materiaal/units', 'PATCH', { order: next.map(u => u.id) }) }
      catch (e) { onChange(c => ({ ...c, units: previous })); throw e }
    })
  }

  function addBulk() {
    if (!names.length || !categoryId) return
    run('bulk', async () => {
      const created = await send<GearUnit[]>('/api/materiaal/units', 'POST', { category_id: categoryId, names })
      onChange(c => ({ ...c, units: [...c.units, ...created] }))
      setBulk('')
    })
  }

  if (!catalog.categories.length) {
    return <p className="py-6 text-center text-sm text-zinc-600">Maak eerst een categorie aan.</p>
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="Categorie">
        {catalog.categories.map(c => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === categoryId}
            onClick={() => { setCategoryId(c.id); setEditing(null) }}
            className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
            style={c.id === categoryId
              ? { backgroundColor: `${c.color}25`, border: `1px solid ${c.color}`, color: c.color }
              : { border: '1px solid #3f3f46', color: '#a1a1aa' }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <SortableList
        items={units}
        onReorder={reorder}
        renderItem={unit => editing === unit.id ? (
          <UnitEditor
            unit={unit}
            catalog={catalog}
            holderOptions={holderOptions}
            onDone={() => setEditing(null)}
            onChange={onChange}
            onError={onError}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-zinc-100 truncate">{unit.name}</span>
                {unit.quantity > 1 && <span className="text-[11px] text-zinc-500 flex-shrink-0">×{unit.quantity}</span>}
                {unit.status !== 'ok' && <StatusBadge status={unit.status} />}
              </div>
              <p className="text-[11px] text-zinc-500 truncate">
                {unit.contents.length > 0 && <span className="mr-2">Kit · {unit.contents.length} onderdelen</span>}
                {unit.home_client_id && (
                  <span className="inline-flex items-center gap-1 text-amber-400/90 mr-2"><UserRound size={10} />{holderName(unit.home_client_id)}</span>
                )}
                {unit.warning && <span className="text-amber-300/80">{unit.warning}</span>}
              </p>
            </div>
            <Link href={`/materiaal/unit/${unit.id}`} className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5">Details</Link>
            <IconButton label={`${unit.name} bewerken`} onClick={() => setEditing(unit.id)}><Pencil size={12} /></IconButton>
          </div>
        )}
      />
      {units.length === 0 && <p className="py-4 text-center text-sm text-zinc-600">Nog niets in {category?.name}.</p>}

      <p className="section-label mt-6 mb-2">Toevoegen aan {category?.name}</p>
      <textarea
        value={bulk}
        onChange={e => setBulk(e.target.value)}
        rows={3}
        placeholder={'Eén stuk per regel, bv.\nSony FX3 A\nSony FX3 B'}
        aria-label="Nieuw materiaal, één per regel"
        className={`${inputCls} resize-y`}
      />
      <div className="flex justify-end mt-2">
        <PrimaryButton onClick={addBulk} busy={busy === 'bulk'} disabled={!names.length}>
          <Plus size={13} /> {names.length > 1 ? `${names.length} stuks toevoegen` : 'Toevoegen'}
        </PrimaryButton>
      </div>
    </>
  )
}

function UnitEditor({ unit, catalog, holderOptions, onDone, onChange, onError }: {
  unit: GearUnit
  catalog: GearCatalog
  holderOptions: GearClientRef[]
  onDone: () => void
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
}) {
  const [f, setF] = useState({
    name: unit.name,
    category_id: unit.category_id,
    quantity: String(unit.quantity),
    label_color: unit.label_color ?? '',
    nd_size: unit.nd_size ?? '',
    warning: unit.warning ?? '',
    notes: unit.notes ?? '',
    home_client_id: unit.home_client_id ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }))

  async function save() {
    setBusy(true); onError('')
    try {
      const updated = await send<Omit<GearUnit, 'contents'>>('/api/materiaal/units', 'PATCH', { id: unit.id, ...f })
      onChange(c => ({ ...c, units: c.units.map(u => (u.id === unit.id ? { ...u, ...updated } : u)) }))
      onDone()
    } catch (e) { onError(e instanceof Error ? e.message : 'Opslaan mislukt.') }
    setBusy(false)
  }

  async function remove() {
    if (!confirm(`"${unit.name}" definitief verwijderen?`)) return
    setBusy(true); onError('')
    try {
      await send('/api/materiaal/units', 'DELETE', { id: unit.id })
      onChange(c => ({ ...c, units: c.units.filter(u => u.id !== unit.id) }))
    } catch (e) { onError(e instanceof Error ? e.message : 'Verwijderen mislukt.') }
    setBusy(false)
  }

  return (
    <div className="space-y-3 py-1">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_6rem] gap-2">
        <Field label="Naam"><input value={f.name} onChange={set('name')} className={inputCls} /></Field>
        <Field label="Categorie">
          <select value={f.category_id} onChange={set('category_id')} className={inputCls}>
            {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Aantal"><input type="number" min={1} value={f.quantity} onChange={set('quantity')} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Labelkleur"><input value={f.label_color} onChange={set('label_color')} placeholder="bv. groen" className={inputCls} /></Field>
        <Field label="ND-filter"><input value={f.nd_size} onChange={set('nd_size')} placeholder="bv. 77" className={inputCls} /></Field>
      </div>
      <Field label="Waarschuwing (staat overal waar je boekt)">
        <input value={f.warning} onChange={set('warning')} placeholder="bv. Enkel MF of foto" className={inputCls} />
      </Field>
      <Field label="Notities"><textarea value={f.notes} onChange={set('notes')} rows={2} className={`${inputCls} resize-y`} /></Field>
      <Field label="Vaste houder (leeg = van iedereen)">
        <select value={f.home_client_id} onChange={set('home_client_id')} className={inputCls}>
          <option value="">— Geen —</option>
          {holderOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      <ContentsEditor unit={unit} onChange={onChange} onError={onError} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={remove} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 disabled:opacity-50">
          <Trash2 size={12} /> Verwijderen
        </button>
        <span className="ml-auto text-[11px] text-zinc-500">
          Status: <Link href={`/materiaal/unit/${unit.id}`} className="underline hover:text-zinc-300">op de detailpagina</Link>
        </span>
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">Sluiten</button>
        <PrimaryButton onClick={save} busy={busy} disabled={!f.name.trim()}><Check size={12} /> Opslaan</PrimaryButton>
      </div>
    </div>
  )
}

// De inhoud van een kit: een checklist. Batterijen, kaarten en kabels worden
// nooit los geboekt, dus het zijn tekstregels en geen eigen materiaal.
function ContentsEditor({ unit, onChange, onError }: {
  unit: GearUnit
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onError: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const setContents = (fn: (list: GearUnitContent[]) => GearUnitContent[]) =>
    onChange(c => ({ ...c, units: c.units.map(u => (u.id === unit.id ? { ...u, contents: fn(u.contents) } : u)) }))

  async function run(fn: () => Promise<void>) {
    setBusy(true); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : 'Er ging iets mis.') }
    setBusy(false)
  }

  function add() {
    if (!label.trim()) return
    run(async () => {
      const created = await send<GearUnitContent>('/api/materiaal/contents', 'POST', { unit_id: unit.id, label, quantity: qty, note })
      setContents(list => [...list, created])
      setLabel(''); setQty('1'); setNote('')
    })
  }

  function update(item: GearUnitContent, fields: Partial<GearUnitContent>) {
    run(async () => {
      const updated = await send<GearUnitContent>('/api/materiaal/contents', 'PATCH', { id: item.id, ...fields })
      setContents(list => list.map(x => (x.id === item.id ? updated : x)))
    })
  }

  function remove(item: GearUnitContent) {
    run(async () => {
      await send('/api/materiaal/contents', 'DELETE', { id: item.id })
      setContents(list => list.filter(x => x.id !== item.id))
    })
  }

  function reorder(next: GearUnitContent[]) {
    const previous = unit.contents
    setContents(() => next.map((x, i) => ({ ...x, sort_order: i + 1 })))
    run(async () => {
      try { await send('/api/materiaal/contents', 'PATCH', { order: next.map(x => x.id) }) }
      catch (e) { setContents(() => previous); throw e }
    })
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
      <p className={labelCls}>Inhoud van de kit {busy && <Loader2 size={10} className="inline animate-spin ml-1" />}</p>
      {unit.contents.length > 0 ? (
        <SortableList
          items={[...unit.contents].sort((a, b) => a.sort_order - b.sort_order)}
          onReorder={reorder}
          renderItem={item => (
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} defaultValue={item.quantity}
                onBlur={e => { if (Number(e.target.value) !== item.quantity) update(item, { quantity: Number(e.target.value) }) }}
                aria-label="Aantal"
                className="w-12 px-1.5 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200"
              />
              <input
                defaultValue={item.label}
                onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== item.label) update(item, { label: e.target.value }) }}
                aria-label="Omschrijving"
                className="flex-1 min-w-0 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200"
              />
              <input
                defaultValue={item.note ?? ''}
                onBlur={e => { if ((e.target.value.trim() || null) !== item.note) update(item, { note: e.target.value }) }}
                placeholder="notitie"
                aria-label="Notitie"
                className="w-32 sm:w-40 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-400 placeholder:text-zinc-700"
              />
              <IconButton label={`${item.label} verwijderen`} danger onClick={() => remove(item)}><Trash2 size={11} /></IconButton>
            </div>
          )}
        />
      ) : (
        <p className="text-xs text-zinc-600 mb-1">Geen inhoud: dit is een los stuk.</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} aria-label="Aantal" className="w-12 px-1.5 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200" />
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="bv. Sony batterij"
          aria-label="Nieuw onderdeel"
          className="flex-1 min-w-0 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 placeholder:text-zinc-700"
        />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="notitie" aria-label="Notitie bij nieuw onderdeel" className="w-32 sm:w-40 px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-400 placeholder:text-zinc-700" />
        <IconButton label="Onderdeel toevoegen" onClick={add}><Plus size={13} /></IconButton>
      </div>
    </div>
  )
}

// ─── Kleine knoppen ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={labelCls}>{label}</span>{children}</label>
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-zinc-800 ${danger ? 'text-zinc-600 hover:text-red-400' : 'text-zinc-500 hover:text-zinc-200'}`}
    >
      {children}
    </button>
  )
}

function PrimaryButton({ onClick, busy, disabled, children }: { onClick: () => void; busy?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:brightness-110"
      style={{ backgroundColor: ACCENT }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
      {children}
    </button>
  )
}
