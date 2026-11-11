'use client'

import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import { ItemBadges, KitBadges, KitIcon, ResponsiblePill, itemNameClass, itemTitle } from '@/components/materiaal/GearLabels'
import type { GridTarget } from '@/components/materiaal/MaterialGrid'
import { IconButton, Select, inputCls } from '@/components/materiaal/ui'
import { DAY_FILTERS, DAY_FILTER_LABEL, type DayEntry, type DayFilter, type DayGroup, type DayHolder, type DayItemEntry } from '@/lib/gear/day-list'
import { responsibleBand, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import { STATUS_LABEL } from '@/lib/gear/status'
import { slotLabel, type Slot } from '@/lib/gear/times'
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
  /** Boeken op die dag; met een vrij stuk vult het formulier die uren in. */
  onBook: (target: GridTarget, gap?: Slot) => void
  onOpenBooking: (bookingId: string) => void
  onOpenItem: (itemId: string) => void
  onOpenKit: (kitId: string) => void
  onOpenCategory: (categoryId: string) => void
  filter: DayFilter
  onFilter: (f: DayFilter) => void
  search: string
  /** Zoeken; het veld staat hier alleen op de telefoon (op de computer in de kopregel). */
  onSearch: (q: string) => void
}

const EMPTY: Record<DayFilter, string> = {
  all: 'Geen materiaal.', out: 'Niets weg op deze dag.', free: 'Niets vrij op deze dag.',
}

export default function DayAgenda(props: Props) {
  const { groups, collapsed, onToggleCategory, openKits, filter, onFilter, search, onSearch } = props
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-3 flex items-center gap-2 lg:justify-end">
        <div className="relative flex-1 min-w-0 lg:hidden">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input type="search" enterKeyHint="search" value={search} onChange={e => onSearch(e.target.value)}
            placeholder="Zoek materiaal of houder…" aria-label="Zoek materiaal"
            className={`${inputCls} pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`} />
          {search && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2"><IconButton label="Zoekopdracht wissen" onClick={() => onSearch('')}><X size={14} /></IconButton></span>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400 flex-shrink-0">
          <span className="hidden sm:inline">Toon</span>
          <Select value={filter} onChange={e => onFilter(e.target.value as DayFilter)}
            aria-label="Toon" wrapperClassName="w-32 sm:w-40" highlighted={filter !== 'all'}>
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
                <div className="flex items-stretch h-11 sm:h-[30px]" style={{ background: `linear-gradient(90deg, ${category.color}26 0%, #09090b 100%), #09090b` }}>
                  <button onClick={() => onToggleCategory(category.id)} aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `${category.name} openklappen` : `${category.name} dichtklappen`}
                    className="flex-shrink-0 flex items-center pl-3 pr-3 sm:pr-1.5">
                    {isCollapsed ? <ChevronRight size={14} style={{ color: category.color }} /> : <ChevronDown size={14} style={{ color: category.color }} />}
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

function Row({ entry, color, part, day, today, canBook, openKits, onToggleKit, onBook, onOpenBooking, onOpenItem, onOpenKit, search }: Props & {
  entry: DayEntry; color: string; part?: boolean
}) {
  const bookable = canBook && day >= today && entry.state === 'vrij'
  // Een onderdeel boek je alleen via zijn kit.
  const target: GridTarget = entry.kind === 'kit' ? { kind: 'kit', id: entry.row.kit.id }
    : entry.row.kitId ? { kind: 'kit', id: entry.row.kitId } : { kind: 'item', id: entry.row.item.id }

  const name = entry.kind === 'kit' ? (() => {
    const { kit, parts } = entry.row
    const open = openKits.has(kit.id)
    // Dichtgeklapt bij het zoeken: welk onderdeel matcht, als het niet de kit zelf is.
    const q = search.trim().toLowerCase()
    const hits = q && !open && !kit.name.toLowerCase().includes(q)
      ? parts.map(p => p.item).filter(i => i.name.toLowerCase().includes(q) || (i.model ?? '').toLowerCase().includes(q)).map(i => i.name) : []
    return (
      <>
        <button onClick={() => onToggleKit(kit.id)} aria-expanded={open} aria-label={open ? 'Onderdelen verbergen' : 'Onderdelen tonen'}
          className="w-9 h-9 -my-1.5 -ml-1 sm:w-5 sm:h-5 sm:my-0 sm:ml-0 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 flex-shrink-0">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <KitIcon />
        <button onClick={() => onOpenKit(kit.id)} title={[kit.name, kit.warning, kit.notes].filter(Boolean).join(' — ')}
          className="min-w-0 text-[13px] font-medium text-zinc-100 truncate text-left hover:underline">
          {kit.name}
        </button>
        <KitBadges kit={kit} parts={parts.map(p => p.item)} />
        {hits.length > 0 && <span className="min-w-0 truncate text-[11px] text-emerald-400/80" title={hits.join(', ')}>· {hits.join(', ')}</span>}
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
  // Met uren: de boekingen en de vrije stukken van die dag, in volgorde.
  const canBookGap = canBook && day >= today
  const segments: ({ kind: 'held'; at: string; h: (typeof entry.holders)[number] } | { kind: 'gap'; at: string; gap: Slot })[] = [
    ...entry.holders.map(h => ({ kind: 'held' as const, at: h.holder.slot.start, h })),
    ...(entry.holders.length ? entry.gaps.map(gap => ({ kind: 'gap' as const, at: gap.start, gap })) : []),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const status = entry.holders.length ? (
    <div className="space-y-1">
      {segments.map(seg => seg.kind === 'held' ? (
        <button key={seg.h.booking.id} onClick={() => onOpenBooking(seg.h.booking.id)} title={holderTitle(seg.h.holder)}
          className={`${statusCls} hover:brightness-125 transition`}
          style={{ background: `${seg.h.holder.color}1f`, border: seg.h.holder.flagged ? '1px solid #ef4444' : `1px solid ${seg.h.holder.color}55` }}>
          {seg.h.holder.flagged && <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
          <span className="min-w-0 truncate font-semibold" style={{ color: seg.h.holder.color }}>
            {seg.h.holder.text}
            {seg.h.holder.project && <span className="font-normal opacity-75"> · {seg.h.holder.project}</span>}
          </span>
          <span className="ml-auto flex-shrink-0 text-xs text-zinc-400 tabular-nums">{whenText(seg.h.holder)}</span>
        </button>
      ) : canBookGap ? (
        <button key={seg.at} onClick={() => onBook(target, seg.gap)}
          className={`${statusCls} group/free border border-dashed border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors`}>
          <span className="text-emerald-400/90">vrij {slotLabel(seg.gap, day)}</span>
          <span className="ml-auto flex-shrink-0 flex items-center gap-1 text-xs text-zinc-500 group-hover/free:text-zinc-200"><Plus size={12} /> {target.kind === 'kit' && entry.kind === 'item' ? 'Kit boeken' : 'Boeken'}</span>
        </button>
      ) : (
        <div key={seg.at} className={`${statusCls} border border-dashed border-zinc-900 text-zinc-500`}>vrij {slotLabel(seg.gap, day)}</div>
      ))}
    </div>
  ) : (
    <Free entry={entry} bookable={bookable} bookKit={target.kind === 'kit' && entry.kind === 'item'} onBook={() => onBook(target)} cls={statusCls} />
  )
  // Telefoon: niets dan "vrij" (of een status) → naam en stand op één regel; anders de stand eronder.
  const { responsible, elsewhere } = freeExtras(entry)
  const compact = !entry.holders.length && !responsible && !elsewhere

  return (
    <div className={`flex ${compact ? 'flex-row items-center gap-2' : 'flex-col gap-1'} px-2 py-1.5 border-t border-zinc-900 sm:grid sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] sm:items-center sm:gap-3 ${part ? 'bg-[#0b0b0d]' : 'bg-zinc-950'}`}>
      <div className={`flex items-center gap-1.5 min-w-0 min-h-7 ${compact ? 'flex-1' : ''} ${part ? 'pl-9' : entry.kind === 'kit' ? '' : 'pl-2'}`}>{name}</div>
      <div className={compact ? 'flex-shrink-0 sm:flex-shrink sm:min-w-0' : part ? 'pl-9 sm:pl-0' : ''}>{status}</div>
    </div>
  )
}

/** Wat er naast "vrij" nog te melden is: de verantwoordelijke en, bij een kit, wat er elders weg is. */
function freeExtras(entry: DayEntry) {
  // Bij een onderdeel staat de verantwoordelijke op de kit.
  const responsible = entry.row.responsible && !(entry.kind === 'item' && entry.row.kitId && entry.row.responsible.viaKit) ? entry.row.responsible : null
  const elsewhere = entry.kind === 'kit' && entry.partsElsewhere > 0
    ? `${entry.partsElsewhere} van ${entry.parts.length} onderdelen elders weg` : null
  return { responsible, elsewhere }
}

/** Vrij, onbeschikbaar, en bij een kit: wat er elders weg is. */
function Free({ entry, bookable, bookKit, onBook, cls }: { entry: DayEntry; bookable: boolean; bookKit: boolean; onBook: () => void; cls: string }) {
  // De verantwoordelijke als gearceerd label, zoals de band in het raster.
  const { responsible: r, elsewhere } = freeExtras(entry)
  const rc = r?.color ?? '#f59e0b'
  const off = entry.state === 'onbeschikbaar'
  const label = !off ? 'Vrij'
    : entry.kind === 'kit' ? 'Geen onderdeel vrij'
    : STATUS_LABEL[(entry as DayItemEntry).row.item.status]
  const inner = (
    <>
      <span className={off ? 'text-zinc-600' : 'text-emerald-400/90'}>{label}</span>
      {elsewhere && (
        <span className="min-w-0 truncate text-xs text-zinc-400 flex items-center gap-1.5">
          <span aria-hidden className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: 'repeating-linear-gradient(135deg, rgba(161,161,170,0.45) 0 2px, transparent 2px 4px)' }} />
          {elsewhere}
        </span>
      )}
      {r && (
        <span title={`${responsibleBand(r)} — ${RESPONSIBLE_NOTICE}`} className="min-w-0 truncate px-1.5 rounded text-[11px] font-medium"
          style={{ color: `${rc}cc`, border: `1px dashed ${rc}66`, background: `repeating-linear-gradient(135deg, ${rc}24 0 4px, transparent 4px 9px)` }}>
          {responsibleBand(r)}
        </span>
      )}
      {bookable && (
        // Op de telefoon alleen een plusje, zodat de naam ernaast de ruimte houdt.
        <span className="ml-auto flex-shrink-0 flex items-center justify-center gap-1 w-6 h-6 sm:w-auto sm:h-auto rounded-md border border-zinc-700 sm:border-0 text-xs text-zinc-400 sm:text-zinc-500 group-hover/free:text-zinc-200">
          <Plus size={12} /><span className="sr-only sm:not-sr-only">{bookKit ? 'Kit boeken' : 'Boeken'}</span>
        </span>
      )}
    </>
  )
  return bookable ? (
    <button onClick={onBook} className={`${cls} group/free border border-transparent hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors`}>{inner}</button>
  ) : (
    <div className={`${cls} border border-transparent`}>{inner}</div>
  )
}

/** "terug om 17:00 · 3–7 nov", "vanaf 14:00", "hele dag · 3–7 nov". */
function whenText(h: DayHolder) {
  const when = h.when.startsWith('tot ') ? `terug om ${h.when.slice(4)}` : h.when
  return h.start === h.end ? when : `${when} · ${periodLabel(h.start, h.end)}`
}

function holderTitle(h: DayHolder) {
  return [h.text, h.project, slotLabel(h.slot), h.flagged ? 'let op: een onderdeel is defect of uit dienst' : null].filter(Boolean).join(' — ')
}
