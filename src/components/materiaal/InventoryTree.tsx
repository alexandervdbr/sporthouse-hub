'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus, Search, X } from 'lucide-react'
import AddGearDialog from '@/components/materiaal/AddGearDialog'
import BulkBar from '@/components/materiaal/BulkBar'
import GearPanel, { type AddPrefill, type PanelTarget } from '@/components/materiaal/GearPanel'
import { ItemBadges, KitBadges, KitIcon, ResponsiblePill, itemNameClass, itemTitle } from '@/components/materiaal/GearLabels'
import { useGearActions } from '@/components/materiaal/useGearActions'
import { Button, ErrorLine, Select, inputCls, send, type People } from '@/components/materiaal/ui'
import type { GearAccess } from '@/lib/gear/access'
import { INVENTORY_VIEWS, VIEW_LABEL, buildInventory, isFiltering, planAddToKit, planDrop, type DragRef, type InventoryFilters, type InventoryView } from '@/lib/gear/inventory'
import { kitByItem } from '@/lib/gear/kits'
import { effectiveResponsible } from '@/lib/gear/responsible'
import type { GearBookingOptions, GearCatalog, GearItem } from '@/lib/gear/types'

// Het voorraadscherm (/materiaal/beheer): één boom zoals de planner —
// categorie → kits → onderdelen, plus losse items. Klik op een rij opent het
// zijpaneel; slepen aan het greepje verplaatst (met het venster voor komende
// boekingen en "Ongedaan maken"); vinkjes voor acties op meerdere items.
// Op de telefoon geen greepjes: daar gaat verplaatsen via het zijpaneel.

/** "S/N 48213…": kort genoeg om de rij rustig te houden; de volledige waarde staat in de tooltip. */
function shortSerial(serial: string) {
  return serial.length > 8 ? `${serial.slice(0, 8)}…` : serial
}

const parseRef = (id: string): DragRef => {
  const [type, ...rest] = id.split(':')
  return { type: type as DragRef['type'], id: rest.join(':') }
}

export default function InventoryTree({ access, initialKitId }: { access: GearAccess; initialKitId: string | null }) {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [people, setPeople] = useState<People>({ clients: [], colleagues: [] })
  const [filters, setFilters] = useState<InventoryFilters>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openKits, setOpenKits] = useState<Set<string>>(new Set(initialKitId ? [initialKitId] : []))
  const [panel, setPanel] = useState<PanelTarget | null>(initialKitId ? { type: 'kit', id: initialKitId } : null)
  const [add, setAdd] = useState<AddPrefill | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try { setCatalog(await send<GearCatalog>('/api/materiaal/catalog', 'GET')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Laden mislukt.') }
  }, [])

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
    send<GearBookingOptions>('/api/materiaal/options', 'GET')
      .then(o => setPeople({ clients: o.clients, colleagues: o.colleagues.map(c => ({ id: c.id, name: c.name })) }))
      .catch(() => {})
  }, [])

  const actions = useGearActions({ catalog, reload, onError: setError })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const tree = useMemo(() => (catalog ? buildInventory(catalog, filters) : []), [catalog, filters])
  const filtering = isFiltering(filters)
  const kitOf = useMemo(() => (catalog ? kitByItem(catalog.kits) : new Map()), [catalog])
  const clients = useMemo(() => new Map((catalog?.clients ?? []).map(c => [c.id, c])), [catalog])
  // Klanten die al verantwoordelijke zijn, staan ook in de keuzelijst.
  const peopleAll = useMemo<People>(() => ({
    colleagues: people.colleagues,
    clients: [...new Map([...(catalog?.clients ?? []), ...people.clients].map(c => [c.id, c])).values()].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
  }), [people, catalog])

  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void, id: string) =>
    set(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function onDragEnd(e: DragEndEvent) {
    if (!catalog || !e.over || e.active.id === e.over.id) return
    actions.run(planDrop(catalog, parseRef(String(e.active.id)), parseRef(String(e.over.id))))
  }

  if (!catalog) {
    return <div className="p-8">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
  }

  const edit = access.manageCatalog
  const itemRow = (item: GearItem, part: boolean) => (
    <TreeRow key={item.id} id={`item:${item.id}`} depth={part ? 2 : 1} draggable={edit} active={panel?.type === 'item' && panel.id === item.id}>
      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(setSelected, item.id)}
        aria-label={`${item.name} selecteren`} className="accent-[#3A913F] flex-shrink-0" />
      <button onClick={() => setPanel({ type: 'item', id: item.id })} title={itemTitle(item)} className={`${itemNameClass(item, part)} hover:underline min-w-0`}>
        {item.name}
      </button>
      <ItemBadges item={item} />
      {item.serial_number && <span title={`Serienummer ${item.serial_number}`} className="text-[10px] text-zinc-600 flex-shrink-0 tabular-nums">S/N {shortSerial(item.serial_number)}</span>}
      {/* Bij een onderdeel staat de verantwoordelijke van de kit al op de kit-rij. */}
      {(() => { const r = effectiveResponsible(item, kitOf.get(item.id) ?? null, clients); return r && (!part || !r.viaKit) ? <ResponsiblePill r={r} /> : null })()}
    </TreeRow>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className={`p-4 sm:p-8 max-w-5xl mx-auto ${panel ? 'sm:pr-[460px] sm:max-w-none' : ''}`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mr-auto">
            <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
            <ChevronRight size={14} /><span className="text-zinc-200">Beheer</span>
            {actions.busy && <Loader2 size={13} className="animate-spin text-zinc-500" />}
          </div>
          {edit && <Button variant="primary" size="sm" onClick={() => setAdd({})}><Plus size={13} /> Toevoegen</Button>}
        </div>

        {/* Zoeken + één weergave tegelijk ("Toon:"). Zoeken werkt binnen die weergave. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[14rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input value={filters.search ?? ''} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Zoek naam, model, serienummer, kit…" aria-label="Zoeken" className={`${inputCls} pl-9 pr-9`} />
            {filters.search && (
              <button onClick={() => setFilters(f => ({ ...f, search: '' }))} aria-label="Zoekopdracht wissen" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"><X size={13} /></button>
            )}
          </div>
          {/* Eén weergave tegelijk; "Alles" zet terug. Opgelicht als er gefilterd wordt. */}
          <label className="flex items-center gap-2 text-xs text-zinc-400 flex-shrink-0">
            Toon
            <Select value={filters.view ?? 'all'} onChange={e => setFilters(f => ({ ...f, view: e.target.value as InventoryView }))}
              aria-label="Toon" wrapperClassName="w-52" highlighted={(filters.view ?? 'all') !== 'all'}>
              {INVENTORY_VIEWS.map(v => <option key={v} value={v}>{VIEW_LABEL[v]}</option>)}
            </Select>
          </label>
        </div>

        {error && <div className="mb-3"><ErrorLine>{error}</ErrorLine></div>}

        <DndContext sensors={sensors} onDragEnd={onDragEnd}
          collisionDetection={args => { const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args) }}>
          <SortableContext items={tree.map(c => `category:${c.category.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {tree.length === 0 && <p className="py-10 text-center text-sm text-zinc-600">Niets gevonden.</p>}
              {tree.map(({ category, kits, loose }) => {
                const isOpen = filtering || !collapsed.has(category.id)
                return (
                  <div key={category.id} className="rounded-xl border border-zinc-800/80 overflow-hidden">
                    <TreeRow id={`category:${category.id}`} depth={0} draggable={edit} header color={category.color}
                      active={panel?.type === 'category' && panel.id === category.id}>
                      <button onClick={() => toggle(setCollapsed, category.id)} aria-expanded={isOpen}
                        aria-label={isOpen ? `${category.name} dichtklappen` : `${category.name} openklappen`} className="flex-shrink-0">
                        {isOpen ? <ChevronDown size={13} style={{ color: category.color }} /> : <ChevronRight size={13} style={{ color: category.color }} />}
                      </button>
                      <button onClick={() => setPanel({ type: 'category', id: category.id })} title={category.name}
                        className="min-w-0 text-[11px] font-bold uppercase tracking-widest truncate hover:underline" style={{ color: category.color }}>
                        {category.name}
                      </button>
                      <span className="text-[10px] text-zinc-500 flex-shrink-0 whitespace-nowrap">{kits.length} {kits.length === 1 ? 'kit' : 'kits'} · {loose.length} los</span>
                      {edit && <AddButton label={`Toevoegen aan ${category.name}`} onClick={() => setAdd({ mode: 'item', categoryId: category.id })} />}
                    </TreeRow>

                    {isOpen && (
                      <>
                        <SortableContext items={kits.map(k => `kit:${k.kit.id}`)} strategy={verticalListSortingStrategy}>
                          {kits.map(({ kit, parts }) => {
                            const kitOpen = filtering || openKits.has(kit.id)
                            const kitResp = effectiveResponsible({ responsible_client_id: null, responsible_user_id: null, responsible_name: null }, kit, clients)
                            return (
                              <div key={kit.id}>
                                <TreeRow id={`kit:${kit.id}`} depth={1} draggable={edit} active={panel?.type === 'kit' && panel.id === kit.id}>
                                  <button onClick={() => toggle(setOpenKits, kit.id)} aria-expanded={kitOpen}
                                    aria-label={kitOpen ? 'Onderdelen verbergen' : 'Onderdelen tonen'} className="flex-shrink-0 text-zinc-500 hover:text-zinc-200">
                                    {kitOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  </button>
                                  <KitIcon />
                                  <button onClick={() => setPanel({ type: 'kit', id: kit.id })} title={kit.name} className="text-[13px] font-medium text-zinc-100 truncate text-left hover:underline min-w-0">
                                    {kit.name}
                                  </button>
                                  {kit.label_color && <span className="hidden md:inline text-[10px] text-zinc-600 flex-shrink-0">{kit.label_color}</span>}
                                  <KitBadges kit={kit} parts={parts} />
                                  <ResponsiblePill r={kitResp ? { name: kitResp.name, viaKit: null } : null} />
                                  {edit && <AddButton label={`Onderdeel toevoegen aan ${kit.name}`} onClick={() => setAdd({ mode: 'item', kitId: kit.id })} />}
                                </TreeRow>
                                {kitOpen && (
                                  <SortableContext items={parts.map(p => `item:${p.id}`)} strategy={verticalListSortingStrategy}>
                                    {parts.map(p => itemRow(p, true))}
                                    {parts.length === 0 && <p className="pl-16 py-1.5 text-xs text-zinc-600">Leeg — sleep hier items naartoe.</p>}
                                  </SortableContext>
                                )}
                              </div>
                            )
                          })}
                        </SortableContext>
                        <SortableContext items={loose.map(i => `item:${i.id}`)} strategy={verticalListSortingStrategy}>
                          {loose.map(i => itemRow(i, false))}
                        </SortableContext>
                        {kits.length === 0 && loose.length === 0 && <p className="pl-10 py-2 text-xs text-zinc-600">Leeg.</p>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>

        {selected.size > 0 && (
          <BulkBar ids={[...selected]} catalog={catalog} run={actions.run} reload={reload}
            onClear={() => setSelected(new Set())} notify={actions.notify} />
        )}
      </div>

      {panel && (
        <GearPanel target={panel} catalog={catalog} people={peopleAll} access={access}
          onClose={() => setPanel(null)} onOpen={setPanel} reload={reload} run={actions.run} onAdd={setAdd}
          onChange={fn => setCatalog(c => (c ? fn(c) : c))} />
      )}
      {add && (
        <AddGearDialog catalog={catalog} prefill={add} onClose={() => setAdd(null)}
          onAddToKit={(items, kit) => actions.run(planAddToKit(items, kit))}
          onCreated={async t => {
            setAdd(null)
            await reload()
            if (t?.type === 'kit') setOpenKits(prev => new Set(prev).add(t.id))
            if (t) setPanel(t)
          }} />
      )}
      {actions.ui}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="ml-1 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800">
      <Plus size={13} />
    </button>
  )
}

/**
 * Eén rij in de boom. Het greepje (niet op de telefoon) start een sleep; de
 * rest van de rij blijft klikbaar. Een rij is ook een plek om iets op los te
 * laten: dan licht ze op.
 */
function TreeRow({ id, depth, draggable, header, color, active, children }: {
  id: string; depth: 0 | 1 | 2; draggable: boolean; header?: boolean; color?: string; active?: boolean; children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active: dragging } = useSortable({ id, disabled: !draggable })
  const dropHere = isOver && dragging && dragging.id !== id
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative',
        background: header ? `linear-gradient(90deg, ${color}22 0%, transparent 70%)` : undefined }}
      className={`flex items-center gap-2 pr-2 border-b border-zinc-900 last:border-b-0 ${header ? 'py-2' : 'py-1.5'} ${
        dropHere ? 'ring-1 ring-inset ring-emerald-500/60 bg-emerald-500/10' : active ? 'bg-zinc-800/60' : isDragging ? 'bg-zinc-800 shadow-xl' : ''}`}>
      <span style={{ width: depth * 20 }} className="flex-shrink-0" />
      {draggable ? (
        <button {...attributes} {...listeners} aria-label="Verslepen" title="Sleep om te verplaatsen"
          className="hidden sm:flex flex-shrink-0 px-1 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing touch-none">
          <GripVertical size={13} />
        </button>
      ) : <span className="hidden sm:block w-[21px] flex-shrink-0" />}
      {children}
    </div>
  )
}
