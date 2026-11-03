'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Loader2, Package, Plus, Search, Trash2, X } from 'lucide-react'
import { Field, IconButton, PrimaryButton, ResponsiblePicker, StatusBadge, inputCls, send, type People } from '@/components/materiaal/ui'
import { kitByItem } from '@/lib/gear/kits'
import type { GearCatalog, GearKit, GearMoveResult } from '@/lib/gear/types'

// Kits samenstellen. Links de kits per categorie (sleep om te ordenen, of
// sleep een onderdeel erop om het te verplaatsen), rechts de gekozen kit.
// Elke verhuis toont eerst welke komende boekingen geraakt worden; standaard
// gaan die mee. Lukt dat bij een boeking niet, dan staat de reden erbij — de
// verhuis zelf gaat altijd door.

interface PreviewStep { booking_id: string; start_date: string; end_date: string; ok: boolean; reason?: string; label: string }
interface Preview { from_kit_id: string | null; remove: PreviewStep[]; add: PreviewStep[] }
interface PendingMove { itemId: string; toKitId: string | null; preview: Preview }

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

export default function KitsTab({ catalog, people, initialKitId, onChange, onReload, onError }: {
  catalog: GearCatalog
  people: People
  initialKitId: string | null
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onReload: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialKitId && catalog.kits.some(k => k.id === initialKitId) ? initialKitId : catalog.kits[0]?.id ?? null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [result, setResult] = useState<{ title: string; failed: GearMoveResult['failed']; updated: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newCat, setNewCat] = useState(catalog.categories[0]?.id ?? '')

  const items = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items])
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const kits = useMemo(() => [...catalog.kits].sort((a, b) => {
    const ca = catalog.categories.find(c => c.id === a.category_id)?.sort_order ?? 0
    const cb = catalog.categories.find(c => c.id === b.category_id)?.sort_order ?? 0
    return ca - cb || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nl')
  }), [catalog.kits, catalog.categories])
  const selected = catalog.kits.find(k => k.id === selectedId) ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); onError('')
    try { await fn() } catch (e) { onError(e instanceof Error ? e.message : 'Er ging iets mis.') }
    setBusy(null)
  }

  // ── Verplaatsen ──────────────────────────────────────────────────────────
  function requestMove(itemId: string, toKitId: string | null) {
    if (kitOf.get(itemId)?.id === (toKitId ?? undefined)) return
    run(`move-${itemId}`, async () => {
      const preview = await send<Preview>(`/api/materiaal/kits/move-preview?item_id=${itemId}&to_kit_id=${toKitId ?? ''}`, 'GET')
      if (preview.remove.length + preview.add.length === 0) await doMove(itemId, toKitId, true)
      else setPending({ itemId, toKitId, preview })
    })
  }

  async function doMove(itemId: string, toKitId: string | null, updateBookings: boolean) {
    const from = kitOf.get(itemId)
    const res = toKitId
      ? await send<GearMoveResult>(`/api/materiaal/kits/${toKitId}/members`, 'POST', { item_id: itemId, update_bookings: updateBookings })
      : await send<GearMoveResult>(`/api/materiaal/kits/${from!.id}/members`, 'DELETE', { item_id: itemId, update_bookings: updateBookings })
    const name = items.get(itemId)?.name ?? 'Onderdeel'
    const to = toKitId ? catalog.kits.find(k => k.id === toKitId)?.name : null
    if (res.updated.length || res.failed.length) {
      setResult({ title: to ? `${name} zit nu in ${to}.` : `${name} is nu los.`, failed: res.failed, updated: res.updated.length })
    } else setResult(null)
    await onReload()
  }

  // ── Slepen ───────────────────────────────────────────────────────────────
  function onDragEnd(e: DragEndEvent) {
    const a = String(e.active.id), o = e.over ? String(e.over.id) : null
    if (!o || a === o) return
    const [aKind, aId] = a.split(':'), [oKind, oId] = o.split(':')
    if (aKind === 'part' && oKind === 'kit' && oId !== selectedId) return requestMove(aId, oId)
    if (aKind === 'part' && oKind === 'part' && selected) {
      const ids = selected.item_ids
      const next = arrayMove(ids, ids.indexOf(aId), ids.indexOf(oId))
      onChange(c => ({ ...c, kits: c.kits.map(k => (k.id === selected.id ? { ...k, item_ids: next } : k)) }))
      return void run('order', async () => {
        try { await send(`/api/materiaal/kits/${selected.id}/members`, 'PATCH', { order: next }) }
        catch (err) { await onReload(); throw err }
      })
    }
    if (aKind === 'kit' && oKind === 'kit') {
      const ka = catalog.kits.find(k => k.id === aId), ko = catalog.kits.find(k => k.id === oId)
      if (!ka || !ko || ka.category_id !== ko.category_id) return
      const same = kits.filter(k => k.category_id === ka.category_id)
      const next = arrayMove(same, same.indexOf(ka), same.indexOf(ko))
      const pos = new Map(next.map((k, i) => [k.id, i + 1]))
      onChange(c => ({ ...c, kits: c.kits.map(k => (pos.has(k.id) ? { ...k, sort_order: pos.get(k.id)! } : k)) }))
      return void run('order', async () => {
        try { await send('/api/materiaal/kits', 'PATCH', { order: next.map(k => k.id) }) }
        catch (err) { await onReload(); throw err }
      })
    }
  }

  function createKit() {
    if (!newName.trim() || !newCat) return
    run('new', async () => {
      const created = await send<GearKit>('/api/materiaal/kits', 'POST', { name: newName, category_id: newCat })
      onChange(c => ({ ...c, kits: [...c.kits, created] }))
      setSelectedId(created.id); setNewName('')
    })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}
      collisionDetection={args => { const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args) }}>
      {result && (
        <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-zinc-200">{result.title} {result.updated > 0 && `${result.updated} komende ${result.updated === 1 ? 'boeking' : 'boekingen'} bijgewerkt.`}</p>
            <IconButton label="Sluiten" onClick={() => setResult(null)}><X size={13} /></IconButton>
          </div>
          {result.failed.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {result.failed.map(f => (
                <li key={f.booking_id} className="text-xs text-amber-300">
                  Niet bijgewerkt: {f.label} ({fmt(f.start_date)}{f.end_date !== f.start_date ? ` – ${fmt(f.end_date)}` : ''}) — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-5">
        {/* Kits */}
        <div>
          <SortableContext items={kits.map(k => `kit:${k.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {catalog.categories.filter(c => kits.some(k => k.category_id === c.id)).map(cat => (
                <div key={cat.id}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: cat.color }}>{cat.name}</p>
                  <div className="space-y-1">
                    {kits.filter(k => k.category_id === cat.id).map(k => (
                      <KitEntry key={k.id} kit={k} active={k.id === selectedId} onSelect={() => setSelectedId(k.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SortableContext>
          <div className="mt-4 rounded-xl border border-zinc-800 p-3 space-y-2">
            <p className="text-xs text-zinc-400">Nieuwe kit</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Naam, bv. FX3 D" aria-label="Naam van de nieuwe kit" className={inputCls} />
            <select value={newCat} onChange={e => setNewCat(e.target.value)} aria-label="Categorie van de nieuwe kit" className={inputCls}>
              {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex justify-end"><PrimaryButton onClick={createKit} busy={busy === 'new'} disabled={!newName.trim()}><Plus size={13} /> Kit maken</PrimaryButton></div>
          </div>
        </div>

        {/* Gekozen kit */}
        <div>
          {selected ? (
            <KitEditor key={selected.id} kit={selected} catalog={catalog} people={people} busy={busy}
              onMove={requestMove} onChange={onChange} onReload={onReload} run={run}
              onDissolved={() => setSelectedId(catalog.kits.find(k => k.id !== selected.id)?.id ?? null)} />
          ) : (
            <p className="py-10 text-center text-sm text-zinc-600">Kies links een kit, of maak er een.</p>
          )}
        </div>
      </div>

      {pending && (
        <MoveDialog pending={pending} catalog={catalog} itemName={items.get(pending.itemId)?.name ?? 'Onderdeel'}
          onCancel={() => setPending(null)}
          onConfirm={update => { const p = pending; setPending(null); run(`move-${p.itemId}`, () => doMove(p.itemId, p.toKitId, update)) }} />
      )}
    </DndContext>
  )
}

function KitEntry({ kit, active, onSelect }: { kit: GearKit; active: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active: dragging } = useSortable({ id: `kit:${kit.id}` })
  const partOver = isOver && String(dragging?.id ?? '').startsWith('part:')
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-lg border px-1 ${isDragging ? 'opacity-70' : ''} ${
        partOver ? 'border-emerald-500/60 bg-emerald-500/10' : active ? 'border-zinc-600 bg-zinc-800/70' : 'border-zinc-800 bg-zinc-900/60'}`}>
      <button {...attributes} {...listeners} aria-label="Verslepen" className="px-1 py-2 text-zinc-600 hover:text-zinc-300 cursor-grab touch-none"><GripVertical size={13} /></button>
      <button onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 text-left">
        <Package size={12} className="text-zinc-500 flex-shrink-0" />
        <span className="text-sm text-zinc-100 truncate">{kit.name}</span>
        <span className="ml-auto text-[10px] text-zinc-500 pr-1">{kit.item_ids.length}</span>
      </button>
    </div>
  )
}

function PartRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `part:${id}` })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`relative flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 ${isDragging ? 'shadow-xl opacity-90' : ''}`}>
      <button {...attributes} {...listeners} aria-label="Verslepen (naar een kit links om te verplaatsen)" title="Sleep om te ordenen, of naar een kit links om te verplaatsen"
        className="px-1.5 py-2 text-zinc-600 hover:text-zinc-300 cursor-grab touch-none"><GripVertical size={13} /></button>
      <div className="flex-1 min-w-0 py-1.5 pr-2">{children}</div>
    </div>
  )
}

function KitEditor({ kit, catalog, people, busy, onMove, onChange, onReload, run, onDissolved }: {
  kit: GearKit
  catalog: GearCatalog
  people: People
  busy: string | null
  onMove: (itemId: string, toKitId: string | null) => void
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  onReload: () => Promise<void>
  run: (key: string, fn: () => Promise<void>) => Promise<void>
  onDissolved: () => void
}) {
  const [f, setF] = useState({
    name: kit.name, category_id: kit.category_id, label_color: kit.label_color ?? '', warning: kit.warning ?? '', notes: kit.notes ?? '',
    responsible_client_id: kit.responsible_client_id, responsible_user_id: kit.responsible_user_id,
  })
  const [query, setQuery] = useState('')
  const [confirmDissolve, setConfirmDissolve] = useState(false)
  const items = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items])
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }))

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return catalog.items.filter(i => !kit.item_ids.includes(i.id))
      .filter(i => i.name.toLowerCase().includes(q) || (i.model ?? '').toLowerCase().includes(q) || (i.serial_number ?? '').toLowerCase().includes(q))
      .slice(0, 10)
  }, [query, catalog.items, kit.item_ids])

  function save() {
    run('kit', async () => {
      const updated = await send<Omit<GearKit, 'item_ids'>>('/api/materiaal/kits', 'PATCH', { id: kit.id, ...f })
      onChange(c => ({ ...c, kits: c.kits.map(k => (k.id === kit.id ? { ...k, ...updated } : k)) }))
    })
  }

  function dissolve() {
    run('dissolve', async () => {
      if (kit.item_ids.length === 0) await send('/api/materiaal/kits', 'DELETE', { id: kit.id }).catch(() => send(`/api/materiaal/kits/${kit.id}/dissolve`, 'POST'))
      else await send(`/api/materiaal/kits/${kit.id}/dissolve`, 'POST')
      onDissolved()
      await onReload()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2">
          <Field label="Naam"><input value={f.name} onChange={set('name')} className={inputCls} /></Field>
          <Field label="Categorie">
            <select value={f.category_id} onChange={set('category_id')} className={inputCls}>
              {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Labelkleur"><input value={f.label_color} onChange={set('label_color')} placeholder="bv. groen" className={inputCls} /></Field>
          <Field label="Verantwoordelijke">
            <ResponsiblePicker people={people} value={{ client: f.responsible_client_id, user: f.responsible_user_id, name: kit.responsible_name }}
              onChange={v => setF(prev => ({ ...prev, ...v }))} />
          </Field>
        </div>
        <Field label="Waarschuwing"><input value={f.warning} onChange={set('warning')} className={inputCls} /></Field>
        <Field label="Notitie"><input value={f.notes} onChange={set('notes')} placeholder="bv. Duo-lader blijft bij FoS" className={inputCls} /></Field>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!confirmDissolve ? (
            <button onClick={() => setConfirmDissolve(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40">
              <Trash2 size={12} /> Kit opheffen
            </button>
          ) : (
            <span className="flex items-center gap-2 text-xs text-zinc-300">
              Alle {kit.item_ids.length} onderdelen worden los; komende boekingen houden hun items. Zeker?
              <button onClick={dissolve} disabled={busy === 'dissolve'} className="px-2 py-1 rounded bg-red-700 text-white disabled:opacity-50">Ja, opheffen</button>
              <button onClick={() => setConfirmDissolve(false)} className="text-zinc-500">Nee</button>
            </span>
          )}
          <Link href={`/materiaal/kit/${kit.id}`} className="ml-auto text-[11px] text-zinc-500 underline hover:text-zinc-300">Bekijken</Link>
          <PrimaryButton onClick={save} busy={busy === 'kit'} disabled={!f.name.trim()}><Check size={12} /> Opslaan</PrimaryButton>
        </div>
      </div>

      <div>
        <p className="section-label mb-2">Onderdelen ({kit.item_ids.length})</p>
        <SortableContext items={kit.item_ids.map(id => `part:${id}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {kit.item_ids.map(id => {
              const item = items.get(id)
              if (!item) return null
              return (
                <PartRow key={id} id={id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/materiaal/item/${id}`} className="text-sm text-zinc-200 hover:underline truncate">{item.name}</Link>
                    {item.status !== 'ok' && <StatusBadge status={item.status} />}
                    {busy === `move-${id}` && <Loader2 size={12} className="animate-spin text-zinc-500" />}
                    <select value="" onChange={e => { if (e.target.value) onMove(id, e.target.value === '-' ? null : e.target.value) }}
                      aria-label={`${item.name} verplaatsen`}
                      className="ml-auto px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-400">
                      <option value="">Verplaats naar…</option>
                      {catalog.kits.filter(k => k.id !== kit.id).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                    <button onClick={() => onMove(id, null)} className="px-2 py-1 rounded text-xs text-zinc-400 border border-zinc-800 hover:text-zinc-200">Uit kit</button>
                  </div>
                </PartRow>
              )
            })}
          </div>
        </SortableContext>
        {kit.item_ids.length === 0 && <p className="py-3 text-sm text-zinc-600">Nog leeg.</p>}

        <div className="relative mt-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Onderdeel toevoegen: zoek op naam, model of serienummer…"
            aria-label="Onderdeel toevoegen" className={`${inputCls} pl-8`} />
          {matches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {matches.map(i => (
                <button key={i.id} onClick={() => { setQuery(''); onMove(i.id, kit.id) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                  <span className="text-sm text-zinc-200 flex-1 truncate">{i.name}</span>
                  <span className="text-[10px] text-zinc-500">{kitOf.get(i.id) ? `zit in ${kitOf.get(i.id)!.name} — verplaatsen` : 'los'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MoveDialog({ pending, catalog, itemName, onCancel, onConfirm }: {
  pending: PendingMove
  catalog: GearCatalog
  itemName: string
  onCancel: () => void
  onConfirm: (updateBookings: boolean) => void
}) {
  const [update, setUpdate] = useState(true)
  const name = (id: string | null) => (id ? catalog.kits.find(k => k.id === id)?.name ?? 'kit' : null)
  const from = name(pending.preview.from_kit_id), to = name(pending.toKitId)
  const Step = ({ s, verb }: { s: PreviewStep; verb: string }) => (
    <li className="text-xs">
      <span className="text-zinc-300">{s.label}</span>{' '}
      <span className="text-zinc-500">{fmt(s.start_date)}{s.end_date !== s.start_date ? ` – ${fmt(s.end_date)}` : ''}</span>{' '}
      {s.ok ? <span className="text-emerald-400">{verb}</span> : <span className="text-amber-300">blijft zo: {s.reason}</span>}
    </li>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="move-title" className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 id="move-title" className="text-sm font-semibold text-zinc-100">
            {itemName} {to ? `naar ${to}` : 'uit de kit halen'}
          </h2>
          {from && <p className="text-xs text-zinc-500 mt-0.5">Nu in {from}</p>}
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {pending.preview.remove.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">Komende boekingen van {from}:</p>
              <ul className="space-y-1">{pending.preview.remove.map(s => <Step key={s.booking_id} s={s} verb="— gaat eruit" />)}</ul>
            </div>
          )}
          {pending.preview.add.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">Komende boekingen van {to}:</p>
              <ul className="space-y-1">{pending.preview.add.map(s => <Step key={s.booking_id} s={s} verb="— komt erbij" />)}</ul>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={update} onChange={e => setUpdate(e.target.checked)} className="accent-[#3A913F]" />
            Deze boekingen ook bijwerken
          </label>
          {!update && <p className="text-xs text-zinc-500">De boekingen blijven dan zoals ze zijn (het onderdeel blijft in de oude boekingen staan).</p>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">Annuleren</button>
          <PrimaryButton onClick={() => onConfirm(update)}>{to ? 'Verplaatsen' : 'Uit kit halen'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
