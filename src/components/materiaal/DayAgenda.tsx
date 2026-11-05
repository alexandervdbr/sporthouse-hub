'use client'

import { AlertTriangle, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { ItemBadges, KitBadges, KitIcon, ResponsiblePill, itemNameClass, itemTitle } from '@/components/materiaal/GearLabels'
import type { GridTarget } from '@/components/materiaal/MaterialGrid'
import { Select } from '@/components/materiaal/ui'
import { DAY_FILTERS, DAY_FILTER_LABEL, type DayEntry, type DayFilter, type DayGroup, type DayHolder, type DayItemEntry } from '@/lib/gear/day-list'
import { STATUS_LABEL } from '@/lib/gear/status'
import { periodLabel } from '@/lib/gear/views'

// De dagweergave: geen raster met één kolom, maar een lijst voor die dag. Per
// categorie dezelfde rijen als het raster (kits, open te klappen, dan losse
// items), met per rij de stand: vrij, of bij wie en voor welke periode. Klik
// op een vrije rij boekt die dag, op een geboekte rij opent de boeking, op de
// naam opent het zijpaneel. Ook de telefoon gebruikt deze lijst.

interface Props {
  groups: DayGroup[]
  day: string
  today: string
  collapsed: Set<string>
  onToggleCategory: (id: string) => void
  openKits: Set<string>
  onToggleKit: (id: string) => void
  canBook: boolean
  onBook: (target: GridTarget) => void
  onOpenBooking: (bookingId: string) => void
  onOpenItem: (itemId: string) => void
  onOpenKit: (kitId: string) => void
  onOpenCategory: (categoryId: string) => void
  filter: DayFilter
  onFilter: (f: DayFilter) => void
  search: string
}

const EMPTY: Record<DayFilter, string> = {
  all: 'Geen materiaal.', out: 'Niets weg op deze dag.', free: 'Niets vrij op deze dag.',
}

export default function DayAgenda(props: Props) {
  const { groups, collapsed, onToggleCategory, openKits, filter, onFilter, search } = props
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-3 flex items-center justify-end">
        <label className="flex items-center gap-2 text-xs text-zinc-400 flex-shrink-0">
          Toon
          <Select value={filter} onChange={e => onFilter(e.target.value as DayFilter)}
            aria-label="Toon" wrapperClassName="w-40" highlighted={filter !== 'all'}>
            {DAY_FILTERS.map(f => <option key={f} value={f}>{DAY_FILTER_LABEL[f]}</option>)}
          </Select>
        </label>
      </div>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">{search ? <>Niets gevonden voor &ldquo;{search}&rdquo;.</> : EMPTY[filter]}</p>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          {groups.map(({ category, entries, out }) => {
            const isCollapsed = collapsed.has(category.id)
            return (
              <section key={category.id} className="border-b border-zinc-800 last:border-b-0">
                <div className="flex items-stretch h-[30px]" style={{ background: `linear-gradient(90deg, ${category.color}26 0%, #09090b 100%), #09090b` }}>
                  <button onClick={() => onToggleCategory(category.id)} aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `${category.name} openklappen` : `${category.name} dichtklappen`}
                    className="flex-shrink-0 flex items-center pl-3 pr-1.5">
                    {isCollapsed ? <ChevronRight size={12} style={{ color: category.color }} /> : <ChevronDown size={12} style={{ color: category.color }} />}
                  </button>
                  <button onClick={() => props.onOpenCategory(category.id)} title={`${category.name} — details`}
                    className="flex-1 min-w-0 flex items-center gap-2 pr-3 text-left">
                    <span className="text-[11px] font-bold uppercase tracking-widest truncate hover:underline" style={{ color: category.color }}>{category.name}</span>
                    <span className="ml-auto flex-shrink-0 text-[10px] text-zinc-600">
                      {out > 0 && <span className="mr-2 font-bold" style={{ color: category.color }}>{out} weg</span>}
                      {entries.length}
                    </span>
                  </button>
                </div>
                {!isCollapsed && entries.map(e => e.kind === 'kit' ? (
                  <div key={`kit-${e.row.kit.id}`}>
                    <Row entry={e} color={category.color} {...props} />
                    {openKits.has(e.row.kit.id) && e.parts.map(p => <Row key={`part-${p.row.item.id}`} entry={p} color={category.color} part {...props} />)}
                  </div>
                ) : (
                  <Row key={`item-${e.row.item.id}`} entry={e} color={category.color} {...props} />
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({ entry, color, part, day, today, canBook, openKits, onToggleKit, onBook, onOpenBooking, onOpenItem, onOpenKit }: Props & {
  entry: DayEntry; color: string; part?: boolean
}) {
  const bookable = canBook && day >= today && entry.state === 'vrij'
  const target: GridTarget = entry.kind === 'kit' ? { kind: 'kit', id: entry.row.kit.id } : { kind: 'item', id: entry.row.item.id }

  const name = entry.kind === 'kit' ? (() => {
    const { kit, parts } = entry.row
    const open = openKits.has(kit.id)
    return (
      <>
        <button onClick={() => onToggleKit(kit.id)} aria-expanded={open} aria-label={open ? 'Onderdelen verbergen' : 'Onderdelen tonen'}
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
        <ResponsiblePill r={entry.row.responsible} />
      </>
    )
  })() : (
    <>
      {!part && <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
      <button onClick={() => onOpenItem(entry.row.item.id)} title={itemTitle(entry.row.item)} className={`${itemNameClass(entry.row.item, part)} hover:underline`}>
        {entry.row.item.name}
      </button>
      <ItemBadges item={entry.row.item} />
      {/* Bij een onderdeel staat de verantwoordelijke van de kit al op de kit-rij. */}
      {(!part || (entry.row.responsible && !entry.row.responsible.viaKit)) && <ResponsiblePill r={entry.row.responsible} />}
    </>
  )

  const statusCls = 'w-full min-w-0 min-h-9 flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-[13px]'
  const status = entry.holder && entry.booking ? (
    <button onClick={() => onOpenBooking(entry.booking!.id)} title={holderTitle(entry.holder)}
      className={`${statusCls} hover:brightness-125 transition`}
      style={{ background: `${entry.holder.color}1f`, border: entry.holder.flagged ? '1px solid #ef4444' : `1px solid ${entry.holder.color}55` }}>
      {entry.holder.flagged && <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
      <span className="min-w-0 truncate font-semibold" style={{ color: entry.holder.color }}>
        {entry.holder.text}
        {entry.holder.project && <span className="font-normal opacity-75"> · {entry.holder.project}</span>}
      </span>
      <span className="ml-auto flex-shrink-0 text-xs text-zinc-400 tabular-nums">{periodLabel(entry.holder.start, entry.holder.end)}</span>
    </button>
  ) : (
    <Free entry={entry} bookable={bookable} onBook={() => onBook(target)} cls={statusCls} />
  )

  return (
    <div className={`flex flex-col gap-1 px-2 py-1.5 border-t border-zinc-900 sm:grid sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] sm:items-center sm:gap-3 ${part ? 'bg-[#0b0b0d]' : 'bg-zinc-950'}`}>
      <div className={`flex items-center gap-1.5 min-w-0 min-h-7 ${part ? 'pl-9' : entry.kind === 'kit' ? '' : 'pl-2'}`}>{name}</div>
      <div className={part ? 'pl-9 sm:pl-0' : ''}>{status}</div>
    </div>
  )
}

/** Vrij, onbeschikbaar, en bij een kit: wat er elders weg is. */
function Free({ entry, bookable, onBook, cls }: { entry: DayEntry; bookable: boolean; onBook: () => void; cls: string }) {
  const off = entry.state === 'onbeschikbaar'
  const label = !off ? 'Vrij'
    : entry.kind === 'kit' ? 'Geen onderdeel vrij'
    : STATUS_LABEL[(entry as DayItemEntry).row.item.status]
  const elsewhere = entry.kind === 'kit' && entry.partsElsewhere > 0
    ? `${entry.partsElsewhere} van ${entry.parts.length} onderdelen elders weg` : null
  const inner = (
    <>
      <span className={off ? 'text-zinc-600' : 'text-emerald-400/90'}>{label}</span>
      {elsewhere && (
        <span className="min-w-0 truncate text-xs text-zinc-400 flex items-center gap-1.5">
          <span aria-hidden className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: 'repeating-linear-gradient(135deg, rgba(161,161,170,0.45) 0 2px, transparent 2px 4px)' }} />
          {elsewhere}
        </span>
      )}
      {bookable && <span className="ml-auto flex-shrink-0 flex items-center gap-1 text-xs text-zinc-500 group-hover/free:text-zinc-200"><Plus size={12} /> Boeken</span>}
    </>
  )
  return bookable ? (
    <button onClick={onBook} className={`${cls} group/free border border-transparent hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors`}>{inner}</button>
  ) : (
    <div className={`${cls} border border-transparent`}>{inner}</div>
  )
}

function holderTitle(h: DayHolder) {
  return [h.text, h.project, periodLabel(h.start, h.end, true), h.flagged ? 'let op: een onderdeel is defect of uit dienst' : null].filter(Boolean).join(' — ')
}
