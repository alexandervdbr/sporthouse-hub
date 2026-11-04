'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Check, Loader2, MoreHorizontal, Package, Plus, Search, Trash2, UserRound, Wrench, X } from 'lucide-react'
import { SerialWarning } from '@/components/materiaal/AddGearDialog'
import { ItemBadges, KitBadges } from '@/components/materiaal/GearLabels'
import { Button, ColorDots, ErrorLine, IconButton, ResponsiblePicker, Select, StatusBadge, formGap, inputCls, labelCls, send, textareaCls, type People } from '@/components/materiaal/ui'
import type { GearAccess } from '@/lib/gear/access'
import { planDrop, planMoveTo, planShift, type Plan } from '@/lib/gear/inventory'
import { kitByItem } from '@/lib/gear/kits'
import { effectiveResponsible, responsibleLabel, responsibleName, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import type { UnitStatus } from '@/lib/gear/status'
import type { GearCatalog, GearCategory, GearItem, GearKit } from '@/lib/gear/types'

// Het zijpaneel van een categorie, kit of item — zelfde paneel in de planner en
// in het voorraadscherm. Tekstvelden bewaren bij het verlaten van het veld;
// de status gaat via knoppen. Zonder Beheren alles alleen-lezen (een defect
// melden kan wel wie mag boeken). Op de telefoon schermvullend.

export type PanelTarget = { type: 'category' | 'kit' | 'item'; id: string }
export type AddPrefill = { mode?: 'item' | 'many' | 'kit' | 'category'; categoryId?: string; kitId?: string }

interface Props {
  target: PanelTarget
  catalog: GearCatalog
  people: People
  access: GearAccess
  onClose: () => void
  onOpen: (t: PanelTarget) => void
  onChange: (fn: (c: GearCatalog) => GearCatalog) => void
  reload: () => Promise<void>
  run: (plan: Plan | null) => Promise<void>
  onAdd: (prefill: AddPrefill) => void
}

type SaveState = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string }

export default function GearPanel(props: Props) {
  const { target, catalog, onClose } = props
  const [save, setSave] = useState<SaveState>({ state: 'idle' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Een veld bewaren: tonen dat het bezig is, en "Opgeslagen ✓" of de fout. */
  async function persist<T>(fn: () => Promise<T>): Promise<T | null> {
    setSave({ state: 'saving' })
    try { const r = await fn(); setSave({ state: 'saved' }); return r }
    catch (e) { setSave({ state: 'error', message: e instanceof Error ? e.message : 'Opslaan mislukt.' }); return null }
  }

  const category = target.type === 'category' ? catalog.categories.find(c => c.id === target.id) : null
  const kit = target.type === 'kit' ? catalog.kits.find(k => k.id === target.id) : null
  const item = target.type === 'item' ? catalog.items.find(i => i.id === target.id) : null
  const title = category?.name ?? kit?.name ?? item?.name
  const kind = { category: 'Categorie', kit: 'Kit', item: 'Item' }[target.type]

  return (
    <aside role="dialog" aria-label={`${kind} ${title ?? ''}`}
      className="fixed z-50 inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] flex flex-col bg-zinc-900 sm:border-l border-zinc-800 shadow-2xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-800">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">{kind}</p>
          <h2 className="text-sm font-semibold text-zinc-100 truncate" title={title}>{title ?? 'Niet gevonden'}</h2>
        </div>
        <span className="text-[11px] mt-1 flex-shrink-0">
          {save.state === 'saving' && <Loader2 size={12} className="animate-spin text-zinc-500" />}
          {save.state === 'saved' && <span className="text-emerald-400 flex items-center gap-1"><Check size={11} /> Opgeslagen</span>}
        </span>
        <IconButton label="Sluiten" onClick={onClose}><X size={16} /></IconButton>
      </div>
      <div className={`flex-1 overflow-y-auto px-5 py-4 ${formGap}`}>
        {save.state === 'error' && <ErrorLine>{save.message}</ErrorLine>}
        {!title && <p className="text-sm text-zinc-500">Dit bestaat niet (meer).</p>}
        {category && <CategoryForm {...props} category={category} persist={persist} />}
        {kit && <KitForm {...props} kit={kit} persist={persist} />}
        {item && <ItemForm {...props} item={item} persist={persist} />}
      </div>
    </aside>
  )
}

type FormProps = Props & { persist: <T>(fn: () => Promise<T>) => Promise<T | null> }

// ─── Bouwstenen ───────────────────────────────────────────────────────────────

/**
 * Tekstveld dat bewaart bij het verlaten (blur) of Enter, als de waarde
 * veranderde. Verandert de bewaarde waarde van buitenaf, dan begint het veld
 * opnieuw (de `key` hieronder), zodat het altijd toont wat er echt staat.
 */
function InlineText(props: {
  label: string; value: string | null; placeholder?: string; disabled?: boolean; multiline?: boolean
  onSave: (v: string) => void
}) {
  return <InlineTextField key={props.value ?? ''} {...props} />
}

function InlineTextField({ label, value, placeholder, disabled, multiline, onSave }: {
  label: string; value: string | null; placeholder?: string; disabled?: boolean; multiline?: boolean
  onSave: (v: string) => void
}) {
  const [v, setV] = useState(value ?? '')
  const commit = () => { if (v.trim() !== (value ?? '').trim()) onSave(v) }
  const common = {
    value: v, disabled, placeholder: disabled ? '' : placeholder, 'aria-label': label,
    onChange: (e: { target: { value: string } }) => setV(e.target.value), onBlur: commit,
    className: inputCls,
  }
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      {multiline ? <textarea rows={2} {...common} className={textareaCls} />
        : <input {...common} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />}
    </label>
  )
}

function SmallButton({ onClick, disabled, children, danger }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; danger?: boolean }) {
  return <Button size="sm" variant={danger ? 'danger' : 'secondary'} onClick={onClick} disabled={disabled}>{children}</Button>
}

function ShiftButtons({ onShift }: { onShift: (dir: -1 | 1) => void }) {
  return (
    <span className="flex items-center gap-1">
      <SmallButton onClick={() => onShift(-1)}><ArrowUp size={12} /> Omhoog</SmallButton>
      <SmallButton onClick={() => onShift(1)}><ArrowDown size={12} /> Omlaag</SmallButton>
    </span>
  )
}

/** "Verplaats naar…": kits (per categorie) of los in een categorie. */
function MoveToSelect({ catalog, itemId, exceptKitId, onPick }: {
  catalog: GearCatalog; itemId: string; exceptKitId?: string | null
  onPick: (to: { kitId: string } | { categoryId: string }) => void
}) {
  const cats = [...catalog.categories].sort((a, b) => a.sort_order - b.sort_order)
  const inKit = kitByItem(catalog.kits).has(itemId)
  const own = catalog.items.find(i => i.id === itemId)?.category_id
  return (
    <Select value="" aria-label="Verplaats naar…" 
      onChange={e => {
        const [kind, id] = e.target.value.split(':')
        if (kind === 'kit') onPick({ kitId: id })
        if (kind === 'cat') onPick({ categoryId: id })
      }}>
      <option value="">Verplaats naar…</option>
      {cats.map(c => {
        const kits = catalog.kits.filter(k => k.category_id === c.id && k.id !== exceptKitId)
        return (
          <optgroup key={c.id} label={c.name}>
            {kits.map(k => <option key={k.id} value={`kit:${k.id}`}>📦 {k.name}</option>)}
            {(inKit || c.id !== own) && <option value={`cat:${c.id}`}>Los in {c.name}</option>}
          </optgroup>
        )
      })}
    </Select>
  )
}

// ─── Categorie ────────────────────────────────────────────────────────────────

function CategoryForm({ category, catalog, access, onChange, persist, run, onAdd, reload, onClose }: FormProps & { category: GearCategory }) {
  const edit = access.manageCatalog
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const kits = catalog.kits.filter(k => k.category_id === category.id)
  const loose = catalog.items.filter(i => i.category_id === category.id && !kitOf.has(i.id))
  const empty = kits.length === 0 && catalog.items.every(i => i.category_id !== category.id)

  async function patch(fields: Partial<GearCategory>) {
    const updated = await persist(() => send<GearCategory>('/api/materiaal/categories', 'PATCH', { id: category.id, ...fields }))
    if (updated) onChange(c => ({ ...c, categories: c.categories.map(x => (x.id === category.id ? updated : x)) }))
  }

  return (
    <>
      <InlineText label="Naam" value={category.name} disabled={!edit} onSave={name => patch({ name })} />
      <div>
        <span className={labelCls}>Kleur</span>
        {edit ? <ColorDots value={category.color} onChange={color => patch({ color })} /> : <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: category.color }} />}
      </div>
      <p className="text-sm text-zinc-400">{kits.length} {kits.length === 1 ? 'kit' : 'kits'} · {loose.length} los</p>
      {edit && (
        <div className="flex flex-wrap gap-2">
          <SmallButton onClick={() => onAdd({ mode: 'item', categoryId: category.id })}><Plus size={12} /> Item</SmallButton>
          <SmallButton onClick={() => onAdd({ mode: 'kit', categoryId: category.id })}><Plus size={12} /> Kit</SmallButton>
          <ShiftButtons onShift={dir => run(planShift(catalog, { type: 'category', id: category.id }, dir))} />
          {empty && (
            <SmallButton danger onClick={async () => {
              if (await persist(() => send('/api/materiaal/categories', 'DELETE', { id: category.id })) !== null) { await reload(); onClose() }
            }}><Trash2 size={12} /> Categorie verwijderen</SmallButton>
          )}
        </div>
      )}
    </>
  )
}

// ─── Kit ──────────────────────────────────────────────────────────────────────

function KitForm({ kit, catalog, people, access, onChange, persist, run, onOpen, reload, onClose }: FormProps & { kit: GearKit }) {
  const edit = access.manageCatalog
  const items = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items])
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const clients = useMemo(() => new Map(catalog.clients.map(c => [c.id, c])), [catalog.clients])
  const parts = kit.item_ids.map(id => items.get(id)).filter((i): i is GearItem => !!i)
  const resp = responsibleName(kit, clients)
  const [menu, setMenu] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  async function patch(fields: Record<string, unknown>) {
    const updated = await persist(() => send<Omit<GearKit, 'item_ids'>>('/api/materiaal/kits', 'PATCH', { id: kit.id, ...fields }))
    if (updated) onChange(c => ({ ...c, kits: c.kits.map(k => (k.id === kit.id ? { ...k, ...updated } : k)) }))
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return catalog.items.filter(i => !kit.item_ids.includes(i.id))
      .filter(i => [i.name, i.model, i.serial_number].some(v => (v ?? '').toLowerCase().includes(q))).slice(0, 8)
  }, [query, catalog.items, kit.item_ids])

  return (
    <>
      {resp && <Notice icon={<UserRound size={13} />}>{RESPONSIBLE_NOTICE} {responsibleLabel({ name: resp, viaKit: null })}</Notice>}
      <InlineText label="Naam" value={kit.name} disabled={!edit} onSave={name => patch({ name })} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelCls}>Categorie</span>
          <Select value={kit.category_id} disabled={!edit} 
            onChange={e => run(planDrop(catalog, { type: 'kit', id: kit.id }, { type: 'category', id: e.target.value }))}>
            {catalog.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <InlineText label="Labelkleur" value={kit.label_color} placeholder="bv. groen" disabled={!edit} onSave={label_color => patch({ label_color })} />
      </div>
      <label className="block">
        <span className={labelCls}>Verantwoordelijke</span>
        {edit
          ? <ResponsiblePicker people={people} value={{ client: kit.responsible_client_id, user: kit.responsible_user_id, name: kit.responsible_name }} onChange={v => patch(v)} />
          : <p className="text-sm text-zinc-300">{resp ?? '— Geen —'}</p>}
      </label>
      <InlineText label="Waarschuwing" value={kit.warning} disabled={!edit} onSave={warning => patch({ warning })} />
      <InlineText label="Notitie" value={kit.notes} placeholder="bv. Duo-lader blijft bij FoS" disabled={!edit} onSave={notes => patch({ notes })} />

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={labelCls}>Onderdelen</span>
          <KitBadges kit={kit} parts={parts} />
        </div>
        <ul className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80">
          {parts.map(p => (
            <li key={p.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => onOpen({ type: 'item', id: p.id })} title={p.name} className="min-w-0 text-sm text-zinc-200 truncate text-left hover:underline">{p.name}</button>
                <ItemBadges item={p} />
                {edit && (
                  <button onClick={() => setMenu(m => (m === p.id ? null : p.id))} aria-label={`Acties voor ${p.name}`} aria-expanded={menu === p.id}
                    className="ml-auto text-zinc-500 hover:text-zinc-200"><MoreHorizontal size={14} /></button>
                )}
              </div>
              {menu === p.id && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <SmallButton onClick={() => run(planShift(catalog, { type: 'item', id: p.id }, -1))}><ArrowUp size={12} /> Omhoog</SmallButton>
                    <SmallButton onClick={() => run(planShift(catalog, { type: 'item', id: p.id }, 1))}><ArrowDown size={12} /> Omlaag</SmallButton>
                    <SmallButton onClick={() => { setMenu(null); run(planMoveTo(catalog, p.id, { categoryId: p.category_id })) }}>Uit kit</SmallButton>
                  </div>
                  <MoveToSelect catalog={catalog} itemId={p.id} exceptKitId={kit.id} onPick={to => { setMenu(null); run(planMoveTo(catalog, p.id, to)) }} />
                </div>
              )}
            </li>
          ))}
          {parts.length === 0 && <li className="px-3 py-2 text-sm text-zinc-600">Nog leeg.</li>}
        </ul>
        {edit && (
          <div className="relative mt-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="+ Onderdeel: zoek naam, model, serienummer…"
              aria-label="Onderdeel toevoegen" className={`${inputCls} pl-8`} />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                {matches.map(i => (
                  <button key={i.id} onClick={() => { setQuery(''); run(planMoveTo(catalog, i.id, { kitId: kit.id })) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                    <span className="text-sm text-zinc-200 flex-1 truncate">{i.name}</span>
                    <span className="text-[10px] text-zinc-500">{kitOf.get(i.id) ? `uit ${kitOf.get(i.id)!.name}` : 'los'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {edit && <ShiftButtons onShift={dir => run(planShift(catalog, { type: 'kit', id: kit.id }, dir))} />}
        {edit && !confirmDissolve && <SmallButton danger onClick={() => setConfirmDissolve(true)}><Trash2 size={12} /> Kit opheffen</SmallButton>}
        {confirmDissolve && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            Alle {parts.length} onderdelen worden los; komende boekingen houden hun items. Zeker?
            <Button size="sm" variant="destructive" onClick={async () => {
              const ok = await persist(() => send(`/api/materiaal/kits/${kit.id}/dissolve`, 'POST'))
              if (ok !== null) { await reload(); onClose() }
            }}>Ja, opheffen</Button>
            <Button size="sm" variant="text" onClick={() => setConfirmDissolve(false)}>Nee</Button>
          </span>
        )}
        <Link href={`/materiaal/kit/${kit.id}`} className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-300">Volledige pagina →</Link>
      </div>
    </>
  )
}

// ─── Item ─────────────────────────────────────────────────────────────────────

function ItemForm({ item, catalog, people, access, onChange, persist, run, onOpen, reload, onClose }: FormProps & { item: GearItem }) {
  const edit = access.manageCatalog
  const kit = useMemo(() => kitByItem(catalog.kits).get(item.id) ?? null, [catalog.kits, item.id])
  const clients = useMemo(() => new Map(catalog.clients.map(c => [c.id, c])), [catalog.clients])
  const resp = effectiveResponsible(item, kit, clients)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function patch(fields: Record<string, unknown>) {
    const updated = await persist(() => send<GearItem>('/api/materiaal/items', 'PATCH', { id: item.id, ...fields }))
    if (updated) onChange(c => ({ ...c, items: c.items.map(i => (i.id === item.id ? updated : i)) }))
  }

  async function setStatus(status: UnitStatus) {
    const updated = await persist(() => send<{ id: string; status: UnitStatus; status_note: string | null }>(`/api/materiaal/items/${item.id}/status`, 'POST', { status, note }))
    if (updated) { onChange(c => ({ ...c, items: c.items.map(i => (i.id === item.id ? { ...i, ...updated } : i)) })); setNote('') }
  }
  const needsNote = (s: UnitStatus) => (s === 'defect' || s === 'beperkt') && !note.trim()

  return (
    <>
      {/* Status: altijd expliciete knoppen. */}
      <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={labelCls}>Status</span>
          <StatusBadge status={item.status} />
          {item.status_note && item.status !== 'ok' && <span className="text-xs text-zinc-400 truncate">{item.status_note}</span>}
        </div>
        {access.book && (
          <>
            <input value={note} onChange={e => setNote(e.target.value)} aria-label="Notitie bij de statuswijziging"
              placeholder={item.status === 'ok' ? 'Wat is er mis? (nodig voor defect/beperkt)' : 'Notitie (optioneel)'} className={inputCls} />
            <div className="flex flex-wrap gap-1.5">
              {item.status !== 'defect' && <SmallButton disabled={needsNote('defect')} onClick={() => setStatus('defect')}><Wrench size={12} /> Defect</SmallButton>}
              {item.status !== 'beperkt' && <SmallButton disabled={needsNote('beperkt')} onClick={() => setStatus('beperkt')}>Beperkt</SmallButton>}
              {edit && item.status !== 'ok' && <SmallButton onClick={() => setStatus('ok')}><Check size={12} /> Hersteld</SmallButton>}
              {edit && item.status !== 'uit_dienst' && <SmallButton onClick={() => setStatus('uit_dienst')}>Uit dienst</SmallButton>}
            </div>
          </>
        )}
      </section>

      {resp && <Notice icon={<UserRound size={13} />}>{RESPONSIBLE_NOTICE} {responsibleLabel(resp)}</Notice>}
      {item.warning && !edit && <Notice icon={<Wrench size={13} />}>{item.warning}</Notice>}

      <InlineText label="Naam" value={item.name} disabled={!edit} onSave={name => patch({ name })} />
      <div className="grid grid-cols-3 gap-2">
        <InlineText label="Model" value={item.model} disabled={!edit} onSave={model => patch({ model })} />
        <InlineText label="Nummer" value={item.number} placeholder="#3" disabled={!edit} onSave={number => patch({ number })} />
        <InlineText label="Serienummer" value={item.serial_number} disabled={!edit} onSave={serial_number => patch({ serial_number })} />
      </div>
      <SerialWarning catalog={catalog} serial={item.serial_number} exceptItemId={item.id} onOpen={id => onOpen({ type: 'item', id })} />
      <div className="grid grid-cols-2 gap-2">
        <InlineText label="Labelkleur" value={item.label_color} disabled={!edit} onSave={label_color => patch({ label_color })} />
        <InlineText label="ND-filter" value={item.nd_size} disabled={!edit} onSave={nd_size => patch({ nd_size })} />
      </div>
      {edit && <InlineText label="Waarschuwing (staat overal waar je boekt)" value={item.warning} onSave={warning => patch({ warning })} />}
      <InlineText label="Notities" value={item.notes} multiline disabled={!edit} onSave={notes => patch({ notes })} />
      <label className="block">
        <span className={labelCls}>Verantwoordelijke {kit ? '(anders die van de kit)' : ''}</span>
        {edit
          ? <ResponsiblePicker people={people} value={{ client: item.responsible_client_id, user: item.responsible_user_id, name: item.responsible_name }} onChange={v => patch(v)} />
          : <p className="text-sm text-zinc-300">{resp ? responsibleLabel(resp).replace('Verantwoordelijke: ', '') : '— Geen —'}</p>}
      </label>

      <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
        <p className="text-sm text-zinc-300 flex items-center gap-1.5">
          <Package size={13} className="text-zinc-500" />
          {kit ? <>Zit in <button onClick={() => onOpen({ type: 'kit', id: kit.id })} className="underline hover:text-zinc-100">{kit.name}</button></>
            : <>Los in {catalog.categories.find(c => c.id === item.category_id)?.name}</>}
        </p>
        {edit && (
          <>
            <MoveToSelect catalog={catalog} itemId={item.id} exceptKitId={kit?.id} onPick={to => run(planMoveTo(catalog, item.id, to))} />
            <ShiftButtons onShift={dir => run(planShift(catalog, { type: 'item', id: item.id }, dir))} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {edit && !confirmDelete && <SmallButton danger onClick={() => setConfirmDelete(true)}><Trash2 size={12} /> Verwijderen</SmallButton>}
        {confirmDelete && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            &ldquo;{item.name}&rdquo; definitief verwijderen?
            <Button size="sm" variant="destructive" onClick={async () => {
              const ok = await persist(() => send('/api/materiaal/items', 'DELETE', { id: item.id }))
              if (ok !== null) { await reload(); onClose() } else setConfirmDelete(false)
            }}>Ja, verwijderen</Button>
            <Button size="sm" variant="text" onClick={() => setConfirmDelete(false)}>Nee</Button>
          </span>
        )}
        <Link href={`/materiaal/item/${item.id}`} className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-300">Volledige pagina (geschiedenis) →</Link>
      </div>
    </>
  )
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
      <span className="mt-0.5 flex-shrink-0 text-amber-400">{icon}</span><span>{children}</span>
    </div>
  )
}
