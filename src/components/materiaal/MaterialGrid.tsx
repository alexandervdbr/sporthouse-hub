'use client'

import type { ReactNode } from 'react'
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical, Package, UserRound } from 'lucide-react'
import { useGridSelection } from '@/components/materiaal/useGridSelection'
import { RESPONSIBLE_NOTICE, responsibleLabel } from '@/lib/gear/responsible'
import { STATUS_LABEL } from '@/lib/gear/status'
import type { GridBar, GridGroup, GridItemRow, GridKitRow } from '@/lib/gear/grid'

// Het raster van de planner: rijen per categorie (eerst kits, dan losse
// items), dagen als kolommen. Een kit is één rij die je openklapt naar zijn
// onderdelen. Alleen tekenen — wat waar staat, rekent src/lib/gear/grid.ts uit.
// Wil het team later dagen als rijen, dan komt er een ander rastercomponent
// naast dit, met dezelfde invoer.

const NAME_W  = 268
const DAY_MIN = 34
const ROW_H   = 36
const PART_H  = 30
const CAT_H   = 30

/** Wat je in het raster selecteert: een hele kit, of één item. */
export type GridTarget = { kind: 'kit'; id: string } | { kind: 'item'; id: string }

interface Props {
  days: string[]
  today: string
  groups: GridGroup[]
  collapsed: Set<string>
  onToggleCategory: (id: string) => void
  openKits: Set<string>
  onToggleKit: (id: string) => void
  canBook: boolean
  onSelectRange: (target: GridTarget, fromIndex: number, toIndex: number) => void
  onOpenBooking: (bookingId: string) => void
  onOpenItem: (itemId: string) => void
  onOpenKit: (kitId: string) => void
  /** Alleen voor Beheren: een categorie met het greepje verslepen. */
  canReorderCategories?: boolean
  onReorderCategory?: (activeId: string, overId: string) => void
}

function dayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return { weekday: d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2), day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6 }
}

export default function MaterialGrid(props: Props) {
  const { days, today, groups, collapsed, onToggleCategory, openKits, onToggleKit } = props
  const selection = useGridSelection((rowId, from, to) => {
    const [kind, id] = rowId.split(':') as ['kit' | 'item', string]
    props.onSelectRange({ kind, id }, from, to)
  })
  const headers = days.map(dayHeader)
  const todayIdx = days.indexOf(today)
  const cols = `${NAME_W}px repeat(${days.length}, minmax(${DAY_MIN}px, 1fr))`
  const dayBg = (i: number) =>
    i === todayIdx ? 'rgba(58,145,63,0.10)' : headers[i].weekend ? 'rgba(255,255,255,0.025)' : 'transparent'
  const ctx = { ...props, cols, dayBg, selection }

  // Categorieën verslepen (Beheren): alleen het greepje start een sleep, zodat
  // klikken op de balk (open/dicht) en slepen om te boeken blijven werken.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const canReorder = !!props.canReorderCategories && !!props.onReorderCategory
  function onDragEnd(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) props.onReorderCategory?.(String(e.active.id), String(e.over.id))
  }

  return (
    <div style={{ minWidth: NAME_W + days.length * DAY_MIN }} className={selection.selecting ? 'select-none' : ''}>
      <div className="sticky top-0 z-20 grid bg-zinc-950 border-b border-zinc-800" style={{ gridTemplateColumns: cols }}>
        <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-4 flex items-end pb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Materiaal</span>
        </div>
        {headers.map((h, i) => (
          <div key={days[i]} className="flex flex-col items-center pt-2 pb-1.5 border-r border-zinc-900" style={{ background: dayBg(i) }}>
            <span className={`text-[9px] uppercase tracking-wide ${h.weekend ? 'text-zinc-600' : 'text-zinc-500'}`}>{h.weekday}</span>
            <span className="text-xs font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full"
              style={i === todayIdx ? { backgroundColor: '#3A913F', color: '#fff' } : { color: h.weekend ? '#71717a' : '#d4d4d8' }}>
              {h.day}
            </span>
          </div>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={groups.map(g => g.category.id)} strategy={verticalListSortingStrategy}>
      {groups.map(({ category, rows }) => {
        const isCollapsed = collapsed.has(category.id)
        const outOn = (i: number) => rows.filter(r => r.bars.some(b => i >= b.startIndex && i < b.startIndex + b.span)).length
        return (
          <CategoryBlock key={category.id} id={category.id} name={category.name} enabled={canReorder}>
            {handle => (<>
            <div className="grid border-b border-zinc-800/80" style={{ gridTemplateColumns: cols, height: CAT_H }}>
              <div className="sticky left-0 z-10 flex items-stretch border-r border-zinc-800"
                style={{ background: `linear-gradient(90deg, ${category.color}26 0%, #09090b 100%), #09090b` }}>
                {handle}
                <button onClick={() => onToggleCategory(category.id)} aria-expanded={!isCollapsed}
                  className={`flex-1 min-w-0 flex items-center gap-2 ${handle ? 'pl-1 pr-3' : 'px-3'} text-left`}>
                  {isCollapsed ? <ChevronRight size={12} style={{ color: category.color }} /> : <ChevronDown size={12} style={{ color: category.color }} />}
                  <span className="text-[11px] font-bold uppercase tracking-widest truncate" style={{ color: category.color }}>{category.name}</span>
                  <span className="ml-auto text-[10px] text-zinc-600 flex-shrink-0">{rows.length}</span>
                </button>
              </div>
              {days.map((iso, i) => {
                const out = isCollapsed ? outOn(i) : 0
                return (
                  <div key={iso} className="flex items-center justify-center border-r border-zinc-900" style={{ background: `${category.color}0d` }}>
                    {out > 0 && <span className="text-[10px] font-bold" style={{ color: category.color }} title={`${out} van ${rows.length} weg`}>{out}</span>}
                  </div>
                )
              })}
            </div>

            {!isCollapsed && rows.map(row => row.kind === 'kit' ? (
              <div key={`kit-${row.kit.id}`}>
                <KitRow row={row} color={category.color} open={openKits.has(row.kit.id)} onToggle={() => onToggleKit(row.kit.id)} {...ctx} />
                {openKits.has(row.kit.id) && row.parts.map(p => (
                  <ItemRow key={`part-${p.item.id}`} row={p} color={category.color} part {...ctx} />
                ))}
              </div>
            ) : (
              <ItemRow key={`item-${row.item.id}`} row={row} color={category.color} {...ctx} />
            ))}
            </>)}
          </CategoryBlock>
        )
      })}
      </SortableContext>
      </DndContext>
    </div>
  )
}

// Eén categorie met al haar rijen; verslepen verplaatst het hele blok. Het
// greepje (alleen voor Beheren) gaat als `handle` naar de categoriebalk.
function CategoryBlock({ id, name, enabled, children }: {
  id: string; name: string; enabled: boolean; children: (handle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled })
  const handle = enabled ? (
    <button {...attributes} {...listeners} aria-label={`Categorie ${name} verslepen`} title="Sleep om de volgorde van de categorieën te wijzigen"
      className="flex-shrink-0 pl-1.5 pr-0.5 flex items-center text-zinc-500 hover:text-zinc-200 cursor-grab active:cursor-grabbing touch-none">
      <GripVertical size={13} />
    </button>
  ) : null
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 15 : undefined }}
      className={isDragging ? 'opacity-80 shadow-2xl' : undefined}>
      {children(handle)}
    </div>
  )
}

type Ctx = Props & { cols: string; dayBg: (i: number) => string; selection: ReturnType<typeof useGridSelection> }

function covers(bars: GridBar[], i: number) {
  return bars.some(b => i >= b.startIndex && i < b.startIndex + b.span)
}

function Bars({ bars, days, today, onOpenBooking, kitName }: { bars: GridBar[]; days: string[]; today: string; onOpenBooking: (id: string) => void; kitName?: string }) {
  return (
    <>
      {bars.map(bar => (
        <button key={bar.bookingId} onClick={() => onOpenBooking(bar.bookingId)}
          title={bar.flagged ? `${bar.text} — let op: een onderdeel is defect of uit dienst` : kitName ? `${bar.text} — ${kitName}` : bar.text}
          className="relative z-[1] my-1 mx-px flex items-center px-2 overflow-hidden text-left hover:brightness-125 transition"
          style={{
            gridColumn: `${bar.startIndex + 2} / span ${bar.span}`, gridRow: 1,
            background: `${bar.color}2e`,
            border: bar.flagged ? '1px solid #ef4444' : `1px solid ${bar.color}70`,
            borderRadius: `${bar.continuesBefore ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesBefore ? 0 : 6}px`,
            opacity: days[bar.startIndex + bar.span - 1] < today ? 0.55 : 1,
          }}>
          {bar.flagged && <AlertTriangle size={10} className="text-red-400 mr-1 flex-shrink-0" />}
          <span className="text-[11px] font-semibold truncate" style={{ color: bar.color }}>{bar.text}</span>
        </button>
      ))}
    </>
  )
}

function Responsible({ r }: { r: GridKitRow['responsible'] }) {
  if (!r) return null
  return (
    <span title={`${RESPONSIBLE_NOTICE} ${responsibleLabel(r)}`}
      className="ml-auto flex-shrink min-w-0 inline-flex items-center gap-0.5 px-1.5 rounded text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10">
      <UserRound size={9} className="flex-shrink-0" />
      <span className="truncate">{r.name}</span>
    </span>
  )
}

function KitRow({ row, color, open, onToggle, days, today, cols, dayBg, selection, canBook, onOpenBooking, onOpenKit }: Ctx & {
  row: GridKitRow; color: string; open: boolean; onToggle: () => void
}) {
  const { kit, parts, bars, elsewhere, defectParts, limitedParts } = row
  const rowId = `kit:${kit.id}`
  return (
    <div className="grid border-b border-zinc-900 group/row" style={{ gridTemplateColumns: cols, height: ROW_H }}>
      <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-1.5 pl-2 pr-2 min-w-0" style={{ gridColumn: 1, gridRow: 1 }}>
        <button onClick={onToggle} aria-expanded={open} aria-label={open ? 'Onderdelen verbergen' : 'Onderdelen tonen'}
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-zinc-200 flex-shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <Package size={12} className="text-zinc-500 flex-shrink-0" aria-hidden />
        <button onClick={() => onOpenKit(kit.id)} title={[kit.name, kit.warning, kit.notes].filter(Boolean).join(' — ')}
          className="text-[13px] font-medium text-zinc-100 truncate text-left hover:underline">
          {kit.name}
        </button>
        <span className="text-[10px] text-zinc-600 flex-shrink-0">{parts.length}</span>
        {defectParts > 0 && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold text-red-400 border border-red-500/40 bg-red-500/10" title={`${defectParts} onderdeel defect of uit dienst`}>{defectParts} defect</span>}
        {limitedParts > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`${limitedParts} onderdeel beperkt bruikbaar`} />}
        {kit.warning && <AlertTriangle size={11} className="text-amber-400/80 flex-shrink-0" aria-label={kit.warning} />}
        <Responsible r={row.responsible} />
      </div>

      {days.map((iso, i) => {
        const free = canBook && iso >= today && !covers(bars, i)
        const selected = selection.isSelected(rowId, i)
        const out = elsewhere[i]
        return (
          <div key={iso}
            onPointerDown={free ? e => { if (e.button === 0) selection.start(rowId, i) } : undefined}
            onPointerEnter={free ? () => selection.extend(rowId, i) : undefined}
            title={out ? `${out} van ${parts.length} onderdelen elders weg` : undefined}
            className={`border-r border-zinc-900 group/cell flex items-center justify-center ${free ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
            style={{
              gridColumn: i + 2, gridRow: 1,
              background: selected ? 'rgba(58,145,63,0.35)'
                : out ? 'repeating-linear-gradient(135deg, rgba(161,161,170,0.18) 0 3px, transparent 3px 7px)' : dayBg(i),
            }}>
            {out > 0 && !selected ? <span className="text-[9px] text-zinc-400 font-medium">{out}</span>
              : free && !selected && <span className="text-xs text-zinc-500 opacity-0 group-hover/cell:opacity-100">+</span>}
          </div>
        )
      })}

      <Bars bars={bars} days={days} today={today} onOpenBooking={onOpenBooking} kitName={kit.name} />
    </div>
  )
}

function ItemRow({ row, color, part, days, today, cols, dayBg, selection, canBook, onOpenBooking, onOpenItem }: Ctx & {
  row: GridItemRow; color: string; part?: boolean
}) {
  const { item, bars } = row
  const unavailable = item.status === 'defect' || item.status === 'uit_dienst'
  const rowId = `item:${item.id}`
  return (
    <div className={`grid border-b border-zinc-900 group/row ${part ? 'bg-zinc-950/60' : ''}`} style={{ gridTemplateColumns: cols, height: part ? PART_H : ROW_H }}>
      <div className={`sticky left-0 z-10 border-r border-zinc-800 flex items-center gap-1.5 pr-2 min-w-0 ${part ? 'bg-[#0b0b0d] pl-9' : 'bg-zinc-950 pl-3'}`}
        style={{ gridColumn: 1, gridRow: 1 }}>
        {!part && <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <button onClick={() => onOpenItem(item.id)}
          title={[item.name, item.serial_number && `S/N ${item.serial_number}`, item.warning,
            item.status !== 'ok' ? `${STATUS_LABEL[item.status]}${item.status_note ? `: ${item.status_note}` : ''}` : null].filter(Boolean).join(' — ')}
          className={`${part ? 'text-[12px]' : 'text-[13px]'} truncate text-left hover:underline ${unavailable ? 'line-through text-zinc-600' : part ? 'text-zinc-400' : 'text-zinc-200'}`}>
          {item.name}
        </button>
        {item.status === 'beperkt' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`Beperkt bruikbaar${item.status_note ? `: ${item.status_note}` : ''}`} />}
        {item.status === 'defect' && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold uppercase text-red-400 border border-red-500/40 bg-red-500/10">defect</span>}
        {item.warning && <AlertTriangle size={11} className="text-amber-400/80 flex-shrink-0" aria-label={item.warning} />}
        {/* Bij een onderdeel staat de verantwoordelijke van de kit al op de kit-rij. */}
        {(!part || (row.responsible && !row.responsible.viaKit)) && <Responsible r={row.responsible} />}
      </div>

      {days.map((iso, i) => {
        const free = canBook && !unavailable && iso >= today && !covers(bars, i)
        const selected = selection.isSelected(rowId, i)
        return (
          <div key={iso}
            onPointerDown={free ? e => { if (e.button === 0) selection.start(rowId, i) } : undefined}
            onPointerEnter={free ? () => selection.extend(rowId, i) : undefined}
            className={`border-r border-zinc-900 group/cell flex items-center justify-center ${free ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
            style={{ gridColumn: i + 2, gridRow: 1, background: selected ? 'rgba(58,145,63,0.35)' : row.responsible && free ? 'rgba(245,158,11,0.05)' : dayBg(i) }}>
            {free && !selected && <span className="text-xs text-zinc-500 opacity-0 group-hover/cell:opacity-100">+</span>}
          </div>
        )
      })}

      <Bars bars={bars} days={days} today={today} onOpenBooking={onOpenBooking} />
    </div>
  )
}
