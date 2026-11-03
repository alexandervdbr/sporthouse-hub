'use client'

import { AlertTriangle, ChevronDown, ChevronRight, Package, UserRound } from 'lucide-react'
import { useGridSelection } from '@/components/materiaal/useGridSelection'
import { DEFAULT_HOME_NOTICE } from '@/lib/gear/labels'
import { STATUS_LABEL } from '@/lib/gear/status'
import type { GridGroup, GridUnitRow } from '@/lib/gear/grid'

// Het raster van de planner: units als rijen, dagen als kolommen. Alleen
// tekenen — welke balken waar staan, rekent src/lib/gear/grid.ts uit. Wil het
// team later dagen als rijen, dan komt er een ander rastercomponent naast
// dit, met dezelfde invoer.

const NAME_W  = 248
const DAY_MIN = 34
const ROW_H   = 36
const CAT_H   = 30

interface Props {
  days: string[]
  today: string
  groups: GridGroup[]
  collapsed: Set<string>
  onToggleCategory: (id: string) => void
  canBook: boolean
  onSelectRange: (unitId: string, fromIndex: number, toIndex: number) => void
  onOpenBooking: (bookingId: string) => void
  onOpenUnit: (unitId: string) => void
}

function dayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return { weekday: d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2), day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6 }
}

export default function MaterialGrid({
  days, today, groups, collapsed, onToggleCategory, canBook, onSelectRange, onOpenBooking, onOpenUnit,
}: Props) {
  const selection = useGridSelection(onSelectRange)
  const headers = days.map(dayHeader)
  const todayIdx = days.indexOf(today)
  const cols = `${NAME_W}px repeat(${days.length}, minmax(${DAY_MIN}px, 1fr))`

  const dayBg = (i: number) =>
    i === todayIdx ? 'rgba(58,145,63,0.10)' : headers[i].weekend ? 'rgba(255,255,255,0.025)' : 'transparent'

  return (
    <div style={{ minWidth: NAME_W + days.length * DAY_MIN }} className={selection.selecting ? 'select-none' : ''}>
      {/* Dagen */}
      <div className="sticky top-0 z-20 grid bg-zinc-950 border-b border-zinc-800" style={{ gridTemplateColumns: cols }}>
        <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-4 flex items-end pb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Materiaal</span>
        </div>
        {headers.map((h, i) => (
          <div key={days[i]} className="flex flex-col items-center pt-2 pb-1.5 border-r border-zinc-900" style={{ background: dayBg(i) }}>
            <span className={`text-[9px] uppercase tracking-wide ${h.weekend ? 'text-zinc-600' : 'text-zinc-500'}`}>{h.weekday}</span>
            <span
              className="text-xs font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full"
              style={i === todayIdx ? { backgroundColor: '#3A913F', color: '#fff' } : { color: h.weekend ? '#71717a' : '#d4d4d8' }}
            >
              {h.day}
            </span>
          </div>
        ))}
      </div>

      {groups.map(({ category, rows }) => {
        const isCollapsed = collapsed.has(category.id)
        return (
          <div key={category.id}>
            <div className="grid border-b border-zinc-800/80" style={{ gridTemplateColumns: cols, height: CAT_H }}>
              <button
                onClick={() => onToggleCategory(category.id)}
                aria-expanded={!isCollapsed}
                className="sticky left-0 z-10 flex items-center gap-2 px-3 border-r border-zinc-800 text-left"
                style={{ background: `linear-gradient(90deg, ${category.color}26 0%, #09090b 100%), #09090b` }}
              >
                {isCollapsed ? <ChevronRight size={12} style={{ color: category.color }} /> : <ChevronDown size={12} style={{ color: category.color }} />}
                <span className="text-[11px] font-bold uppercase tracking-widest truncate" style={{ color: category.color }}>{category.name}</span>
                <span className="ml-auto text-[10px] text-zinc-600 flex-shrink-0">{rows.length}</span>
              </button>
              {days.map((iso, i) => {
                // Dichtgeklapt: hoeveel stuks uit deze categorie die dag weg zijn.
                const out = isCollapsed ? rows.filter(r => r.bars.some(b => i >= b.startIndex && i < b.startIndex + b.span)).length : 0
                return (
                  <div key={iso} className="flex items-center justify-center border-r border-zinc-900" style={{ background: `${category.color}0d` }}>
                    {out > 0 && <span className="text-[10px] font-bold" style={{ color: category.color }} title={`${out} van ${rows.length} weg`}>{out}</span>}
                  </div>
                )
              })}
            </div>

            {!isCollapsed && rows.map(row => (
              <UnitRow
                key={row.unit.id}
                row={row}
                color={category.color}
                cols={cols}
                days={days}
                today={today}
                dayBg={dayBg}
                canBook={canBook}
                selection={selection}
                onOpenBooking={onOpenBooking}
                onOpenUnit={onOpenUnit}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function UnitRow({ row, color, cols, days, today, dayBg, canBook, selection, onOpenBooking, onOpenUnit }: {
  row: GridUnitRow
  color: string
  cols: string
  days: string[]
  today: string
  dayBg: (i: number) => string
  canBook: boolean
  selection: ReturnType<typeof useGridSelection>
  onOpenBooking: (id: string) => void
  onOpenUnit: (id: string) => void
}) {
  const { unit, holder, bars } = row
  const unavailable = unit.status === 'defect' || unit.status === 'uit_dienst'
  const bookable = canBook && !unavailable
  const taken = (i: number) => bars.some(b => i >= b.startIndex && i < b.startIndex + b.span)

  return (
    <div className="grid border-b border-zinc-900 group/row" style={{ gridTemplateColumns: cols, height: ROW_H }}>
      <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-1.5 pl-3 pr-2 min-w-0" style={{ gridColumn: 1, gridRow: 1 }}>
        <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <button
          onClick={() => onOpenUnit(unit.id)}
          title={[unit.name, unit.warning, unit.status !== 'ok' ? `${STATUS_LABEL[unit.status]}${unit.status_note ? `: ${unit.status_note}` : ''}` : null].filter(Boolean).join(' — ')}
          className={`text-[13px] truncate text-left hover:underline ${unavailable ? 'line-through text-zinc-600' : 'text-zinc-200'}`}
        >
          {unit.name}
        </button>
        {unit.quantity > 1 && <span className="text-[10px] text-zinc-500 flex-shrink-0">×{unit.quantity}</span>}
        {unit.contents.length > 0 && <Package size={11} className="text-zinc-600 flex-shrink-0" aria-label="Kit" />}
        {unit.status === 'beperkt' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`Beperkt bruikbaar${unit.status_note ? `: ${unit.status_note}` : ''}`} />}
        {unit.status === 'defect' && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold uppercase text-red-400 border border-red-500/40 bg-red-500/10">defect</span>}
        {unit.warning && <AlertTriangle size={11} className="text-amber-400/80 flex-shrink-0" aria-label={unit.warning} />}
        {holder && (
          <span title={`${DEFAULT_HOME_NOTICE} ${holder.name}.`}
            className="ml-auto flex-shrink min-w-0 inline-flex items-center gap-0.5 px-1.5 rounded text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10">
            <UserRound size={9} className="flex-shrink-0" />
            <span className="truncate">{holder.name}</span>
          </span>
        )}
      </div>

      {days.map((iso, i) => {
        const free = bookable && iso >= today && !taken(i)
        const selected = selection.isSelected(unit.id, i)
        return (
          <div
            key={iso}
            onPointerDown={free ? e => { if (e.button === 0) selection.start(unit.id, i) } : undefined}
            onPointerEnter={free ? () => selection.extend(unit.id, i) : undefined}
            className={`border-r border-zinc-900 group/cell flex items-center justify-center ${free ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
            style={{
              gridColumn: i + 2, gridRow: 1,
              background: selected ? 'rgba(58,145,63,0.35)' : holder && free ? 'rgba(245,158,11,0.05)' : dayBg(i),
            }}
          >
            {free && !selected && <span className="text-xs text-zinc-500 opacity-0 group-hover/cell:opacity-100">+</span>}
          </div>
        )
      })}

      {bars.map(bar => (
        <button
          key={bar.bookingId}
          onClick={() => onOpenBooking(bar.bookingId)}
          title={bar.flagged ? `${bar.text} — let op: ${unit.name} is ${STATUS_LABEL[unit.status].toLowerCase()}` : bar.text}
          className="relative z-[1] my-1 mx-px flex items-center px-2 overflow-hidden text-left hover:brightness-125 transition"
          style={{
            gridColumn: `${bar.startIndex + 2} / span ${bar.span}`,
            gridRow: 1,
            background: `${bar.color}2e`,
            border: bar.flagged ? '1px solid #ef4444' : `1px solid ${bar.color}70`,
            borderRadius: `${bar.continuesBefore ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesBefore ? 0 : 6}px`,
            opacity: days[bar.startIndex + bar.span - 1] < today ? 0.55 : 1,
          }}
        >
          {bar.flagged && <AlertTriangle size={10} className="text-red-400 mr-1 flex-shrink-0" />}
          <span className="text-[11px] font-semibold truncate" style={{ color: bar.color }}>{bar.text}</span>
        </button>
      ))}
    </div>
  )
}
