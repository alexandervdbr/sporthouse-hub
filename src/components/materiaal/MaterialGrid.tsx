'use client'

import type { ReactNode } from 'react'
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useGridSelection } from '@/components/materiaal/useGridSelection'
import { ItemBadges, KitBadges, KitIcon, ResponsiblePill, itemNameClass, itemTitle } from '@/components/materiaal/GearLabels'
import { freeStretches, type GridBar, type GridGroup, type GridItemRow, type GridKitRow } from '@/lib/gear/grid'
import { responsibleBand, RESPONSIBLE_NOTICE, type EffectiveResponsible } from '@/lib/gear/responsible'
import { dayFullyBusy, slotLabel } from '@/lib/gear/times'

// Het raster van de planner: rijen per categorie (eerst kits, dan losse
// items), dagen als kolommen. Een kit is één rij die je openklapt naar zijn
// onderdelen. Alleen tekenen — wat waar staat, rekent src/lib/gear/grid.ts uit.
// Wil het team later dagen als rijen, dan komt er een ander rastercomponent
// naast dit, met dezelfde invoer. Dezelfde component tekent de maand en de
// week; in de week (`wide`) zijn de kolommen breed genoeg voor meer tekst.

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
  onOpenCategory?: (categoryId: string) => void
  /** Alleen voor Beheren: een categorie met het greepje verslepen. */
  canReorderCategories?: boolean
  onReorderCategory?: (activeId: string, overId: string) => void
  /** Weekweergave: brede dagen, met de maand in de kop en het project op de balk. */
  wide?: boolean
}

function dayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return {
    weekday: d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2), day: d.getDate(),
    month: d.toLocaleDateString('nl-BE', { month: 'short' }).replace('.', ''), weekend: d.getDay() === 0 || d.getDay() === 6,
  }
}

export default function MaterialGrid(props: Props) {
  const { days, today, groups, collapsed, onToggleCategory, openKits, onToggleKit, wide } = props
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
            <span className="flex items-center gap-1">
              <span className="text-xs font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full"
                style={i === todayIdx ? { backgroundColor: '#3A913F', color: '#fff' } : { color: h.weekend ? '#71717a' : '#d4d4d8' }}>
                {h.day}
              </span>
              {wide && <span className={`text-xs ${h.weekend ? 'text-zinc-600' : 'text-zinc-500'}`}>{h.month}</span>}
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
                  aria-label={isCollapsed ? `${category.name} openklappen` : `${category.name} dichtklappen`}
                  className={`flex-shrink-0 flex items-center ${handle ? 'pl-1' : 'pl-3'} pr-1.5`}>
                  {isCollapsed ? <ChevronRight size={12} style={{ color: category.color }} /> : <ChevronDown size={12} style={{ color: category.color }} />}
                </button>
                <button onClick={() => props.onOpenCategory?.(category.id)} title={`${category.name} — details`}
                  className="flex-1 min-w-0 flex items-center gap-2 pr-3 text-left">
                  <span className="text-[11px] font-bold uppercase tracking-widest truncate hover:underline" style={{ color: category.color }}>{category.name}</span>
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

/** Is de dag helemaal bezet? Een deels bezette dag blijft klikbaar (de uren vult het formulier in). */
function fullDay(bars: GridBar[], day: string) {
  return dayFullyBusy(day, bars.map(b => b.slot))
}

/**
 * De balken van een rij. Met uren beginnen of eindigen ze midden in een dag:
 * een omhulsel over de hele dagen, met de balk erin op de juiste fractie. Zo
 * staan een boeking tot 10:00 en een vanaf 14:00 samen in dezelfde dagcel, en
 * blijft het vrije stuk van de cel klikbaar (het omhulsel laat klikken door).
 */
function Bars({ bars, days, today, onOpenBooking, kitName, wide }: { bars: GridBar[]; days: string[]; today: string; onOpenBooking: (id: string) => void; kitName?: string; wide?: boolean }) {
  return (
    <>
      {bars.map(bar => {
        const text = wide && bar.project ? `${bar.text} · ${bar.project}` : bar.text
        const when = slotLabel(bar.slot)
        const partialStart = bar.startFrac > 0, partialEnd = bar.endFrac < 1
        const r = (cut: boolean) => (cut ? 0 : 6)
        return (
          <div key={bar.bookingId} className="relative z-[1] my-1 mx-px pointer-events-none"
            style={{ gridColumn: `${bar.startIndex + 2} / span ${bar.span}`, gridRow: 1 }}>
            <button onClick={() => onOpenBooking(bar.bookingId)}
              title={`${text} · ${when}${bar.flagged ? ' — let op: een onderdeel is defect of uit dienst' : kitName ? ` — ${kitName}` : ''}`}
              className="pointer-events-auto absolute inset-y-0 flex items-center px-1.5 overflow-hidden text-left hover:brightness-125 transition"
              style={{
                left: `${(bar.startFrac / bar.span) * 100}%`,
                right: `${((1 - bar.endFrac) / bar.span) * 100}%`,
                minWidth: 4,
                background: `${bar.color}2e`,
                border: bar.flagged ? '1px solid #ef4444' : `1px solid ${bar.color}70`,
                borderRadius: `${r(bar.continuesBefore)}px ${r(bar.continuesAfter)}px ${r(bar.continuesAfter)}px ${r(bar.continuesBefore)}px`,
                opacity: bar.slot.end <= `${today}T00:00` || days[bar.startIndex + bar.span - 1] < today ? 0.55 : 1,
              }}>
              {bar.flagged && <AlertTriangle size={10} className="text-red-400 mr-1 flex-shrink-0" />}
              <span className="text-[11px] font-semibold truncate" style={{ color: bar.color }}>
                {wide && partialStart && <span className="font-normal opacity-75">{bar.slot.start.slice(11, 16)} </span>}
                {bar.text}
                {wide && bar.project && <span className="font-normal opacity-75"> · {bar.project}</span>}
                {wide && partialEnd && <span className="font-normal opacity-75"> → {bar.slot.end.slice(11, 16)}</span>}
              </span>
            </button>
          </div>
        )
      })}
    </>
  )
}

/**
 * De verantwoordelijke als band over de vrije dagen van de rij (gearceerd, in
 * de kleur van de klant), met de echte boekingen erbovenop. Klikken gaat
 * erdoorheen naar de dag eronder.
 */
function ResponsibleBand({ r, bars, days }: { r: EffectiveResponsible; bars: GridBar[]; days: number }) {
  const c = r.color ?? '#f59e0b'
  const text = responsibleBand(r)
  return (
    <>
      {freeStretches(bars, days).map(s => (
        <div key={s.startIndex} aria-hidden title={`${text} — ${RESPONSIBLE_NOTICE}`}
          className="pointer-events-none relative my-1.5 mx-px flex items-center px-2 overflow-hidden rounded-md"
          style={{
            gridColumn: `${s.startIndex + 2} / span ${s.span}`, gridRow: 1,
            background: `repeating-linear-gradient(135deg, ${c}24 0 4px, transparent 4px 9px)`,
            border: `1px dashed ${c}66`,
          }}>
          <span className="text-[10px] font-medium truncate" style={{ color: `${c}cc` }}>{text}</span>
        </div>
      ))}
    </>
  )
}

function KitRow({ row, color, open, onToggle, days, today, cols, dayBg, selection, canBook, onOpenBooking, onOpenKit, wide }: Ctx & {
  row: GridKitRow; color: string; open: boolean; onToggle: () => void
}) {
  const { kit, parts, bars, elsewhere } = row
  const rowId = `kit:${kit.id}`
  return (
    <div className="grid border-b border-zinc-900 group/row" style={{ gridTemplateColumns: cols, height: ROW_H }}>
      <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-1.5 pl-2 pr-2 min-w-0" style={{ gridColumn: 1, gridRow: 1 }}>
        <button onClick={onToggle} aria-expanded={open} aria-label={open ? 'Onderdelen verbergen' : 'Onderdelen tonen'}
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-zinc-200 flex-shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <KitIcon />
        <button onClick={() => onOpenKit(kit.id)} title={[kit.name, kit.warning, kit.notes].filter(Boolean).join(' — ')}
          className="min-w-0 text-[13px] font-medium text-zinc-100 truncate text-left hover:underline">
          {kit.name}
        </button>
        <KitBadges kit={kit} parts={parts.map(p => p.item)} />
        <ResponsiblePill r={row.responsible} />
      </div>

      {days.map((iso, i) => {
        const free = canBook && iso >= today && !fullDay(bars, iso)
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

      {row.responsible && <ResponsibleBand r={row.responsible} bars={bars} days={days.length} />}
      <Bars bars={bars} days={days} today={today} onOpenBooking={onOpenBooking} kitName={kit.name} wide={wide} />
    </div>
  )
}

function ItemRow({ row, color, part, days, today, cols, dayBg, selection, canBook, onOpenBooking, onOpenItem, onSelectRange, wide }: Ctx & {
  row: GridItemRow; color: string; part?: boolean
}) {
  const { item, bars } = row
  const unavailable = item.status === 'defect' || item.status === 'uit_dienst'
  const rowId = `item:${item.id}`
  // Een onderdeel boek je alleen via zijn kit: een klik op een vrije dag biedt de hele kit aan.
  const kitId = row.kitId
  return (
    <div className={`grid border-b border-zinc-900 group/row ${part ? 'bg-zinc-950/60' : ''}`} style={{ gridTemplateColumns: cols, height: part ? PART_H : ROW_H }}>
      <div className={`sticky left-0 z-10 border-r border-zinc-800 flex items-center gap-1.5 pr-2 min-w-0 ${part ? 'bg-[#0b0b0d] pl-9' : 'bg-zinc-950 pl-3'}`}
        style={{ gridColumn: 1, gridRow: 1 }}>
        {!part && <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <button onClick={() => onOpenItem(item.id)} title={itemTitle(item)} className={`${itemNameClass(item, part)} hover:underline`}>
          {item.name}
        </button>
        <ItemBadges item={item} />
        {/* Bij een onderdeel staat de verantwoordelijke van de kit al op de kit-rij. */}
        {(!part || (row.responsible && !row.responsible.viaKit)) && <ResponsiblePill r={row.responsible} />}
      </div>

      {days.map((iso, i) => {
        const free = canBook && !unavailable && iso >= today && !fullDay(bars, iso)
        const selected = selection.isSelected(rowId, i)
        if (kitId) return (
          <div key={iso} onClick={free ? () => onSelectRange({ kind: 'kit', id: kitId }, i, i) : undefined}
            title={free ? 'Onderdelen boek je via de kit: klik om de hele kit te boeken' : undefined}
            className={`border-r border-zinc-900 group/cell flex items-center justify-center ${free ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
            style={{ gridColumn: i + 2, gridRow: 1, background: dayBg(i) }}>
            {free && <span className="text-[9px] text-zinc-500 opacity-0 group-hover/cell:opacity-100 whitespace-nowrap">+ kit</span>}
          </div>
        )
        return (
          <div key={iso}
            onPointerDown={free ? e => { if (e.button === 0) selection.start(rowId, i) } : undefined}
            onPointerEnter={free ? () => selection.extend(rowId, i) : undefined}
            className={`border-r border-zinc-900 group/cell flex items-center justify-center ${free ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
            style={{ gridColumn: i + 2, gridRow: 1, background: selected ? 'rgba(58,145,63,0.35)' : dayBg(i) }}>
            {free && !selected && <span className="text-xs text-zinc-500 opacity-0 group-hover/cell:opacity-100">+</span>}
          </div>
        )
      })}

      {/* Bij een onderdeel staat de band van de kit al op de kit-rij. */}
      {row.responsible && (!part || !row.responsible.viaKit) && <ResponsibleBand r={row.responsible} bars={bars} days={days.length} />}
      <Bars bars={bars} days={days} today={today} onOpenBooking={onOpenBooking} wide={wide} />
    </div>
  )
}
