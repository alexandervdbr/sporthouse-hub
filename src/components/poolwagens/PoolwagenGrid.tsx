'use client'

import { AlertTriangle, Ban, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useGridSelection } from '@/components/materiaal/useGridSelection'
import type { GridCarRow } from '@/lib/poolwagens/grid'
import type { PoolView, ViewColumn } from '@/lib/poolwagens/views'

// Het raster: wagens als rijen, de kolommen van de gekozen weergave (een half
// uur in Dag, een dag in Week en Maand) — dezelfde oriëntatie als de
// materiaalplanner, en dezelfde sleepselectie (useGridSelection). De balken
// staan op het juiste moment (links/breedte in procent, uitgerekend in
// src/lib/poolwagens/grid.ts); dit tekent alleen.

const NAME_W = 200
const COL_MIN: Record<PoolView, number> = { dag: 30, week: 112, maand: 34 }
const ROW_H: Record<PoolView, number> = { dag: 44, week: 44, maand: 40 }
/** Hoogte van één baan als een rij meer dan één baan heeft. */
const LANE_H = 22

const STATE_COLOR = {
  gepland:       '#3A913F',
  onderweg:      '#0ea5e9',
  te_laat:       '#ef4444',
  teruggebracht: '#71717a',
} as const

const STATE_LABEL = {
  gepland: 'Gepland',
  onderweg: 'Onderweg',
  te_laat: 'Te laat terug',
  teruggebracht: 'Teruggebracht',
} as const

interface Props {
  view: PoolView
  columns: ViewColumn[]
  rows: GridCarRow[]
  canBook: boolean
  /** Is dit vak voorbij? Daar kan je niet op klikken. */
  isPast: (index: number) => boolean
  /** De rode lijn van nu, in procent van het venster. */
  nowPct: number | null
  onSelectRange: (carId: string, fromIndex: number, toIndex: number) => void
  onOpenReservation: (id: string) => void
}

export default function PoolwagenGrid({ view, columns, rows, canBook, isPast, nowPct, onSelectRange, onOpenReservation }: Props) {
  const selection = useGridSelection(onSelectRange)
  const n = columns.length
  const cols = `${NAME_W}px repeat(${n}, minmax(${COL_MIN[view]}px, 1fr))`
  const colBg = (c: ViewColumn) =>
    c.today ? 'rgba(58,145,63,0.10)' : c.weekend ? 'rgba(255,255,255,0.025)' : 'transparent'
  // In de dagweergave een lijn per uur (rechts van het tweede halfuur), een
  // zwakkere per half uur.
  const colBorder = (i: number) => (view === 'dag' && i % 2 === 0 ? 'border-zinc-900/40' : 'border-zinc-900')

  return (
    <div style={{ minWidth: NAME_W + n * COL_MIN[view] }} className={selection.selecting ? 'select-none' : ''}>
      <div className="grid bg-zinc-950 border-b border-zinc-800" style={{ gridTemplateColumns: cols }}>
        <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-4 flex items-end pb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Poolwagens</span>
        </div>
        {columns.map((c, i) => view === 'dag' ? (
          <div key={c.key} className={`relative h-9 border-r ${colBorder(i)}`}>
            {c.top && <span className="absolute left-1 bottom-1.5 text-[11px] tabular-nums text-zinc-400 whitespace-nowrap">{c.top}:00</span>}
          </div>
        ) : (
          <div key={c.key} className="flex flex-col items-center pt-2 pb-1.5 border-r border-zinc-900" style={{ background: colBg(c) }}>
            <span className={`text-[9px] uppercase tracking-wide ${c.weekend ? 'text-zinc-600' : 'text-zinc-500'}`}>{c.top}</span>
            <span className={`text-xs font-semibold tabular-nums h-6 flex items-center justify-center rounded-full ${view === 'week' ? 'px-2' : 'w-6'}`}
              style={c.today ? { backgroundColor: '#3A913F', color: '#fff' } : { color: c.weekend ? '#71717a' : '#d4d4d8' }}>
              {c.main}
            </span>
          </div>
        ))}
      </div>

      {rows.map(({ car, block, bars, lanes }) => {
        const bookable = canBook && !block
        const rowH = lanes > 1 ? Math.max(ROW_H[view], lanes * LANE_H + 4) : ROW_H[view]
        // Eén baan: de balk vult de rij. Meer banen: onder elkaar.
        const laneStyle = (lane: number) => (lanes > 1 ? { top: 2 + lane * LANE_H, height: LANE_H - 2 } : { top: 4, bottom: 4 })
        return (
          <div key={car.id} className="grid border-b border-zinc-900" style={{ gridTemplateColumns: cols, height: rowH }}>
            <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-2 pl-3 pr-2 min-w-0" style={{ gridColumn: 1, gridRow: 1 }}
              title={block ? block.reason : `${car.name} — ${car.license_plate}`}>
              <span className="w-0.5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: block ? '#ef4444' : '#3A913F' }} />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] truncate ${block ? 'text-zinc-500' : 'text-zinc-200'}`}>{car.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono truncate">{car.license_plate}</div>
              </div>
              {block && <Ban size={12} className="flex-shrink-0 text-red-400" aria-label="Niet beschikbaar" />}
            </div>

            {columns.map((c, i) => {
              const free = bookable && !isPast(i)
              const selected = selection.isSelected(car.id, i)
              return (
                <div key={c.key}
                  onPointerDown={free ? e => { if (e.button === 0) selection.start(car.id, i) } : undefined}
                  onPointerEnter={free ? () => selection.extend(car.id, i) : undefined}
                  className={`border-r ${colBorder(i)} ${free ? 'cursor-pointer hover:bg-zinc-800/40' : ''}`}
                  style={{
                    gridColumn: i + 2, gridRow: 1,
                    background: selected ? 'rgba(58,145,63,0.35)'
                      : block ? 'repeating-linear-gradient(135deg, rgba(239,68,68,0.06) 0 6px, transparent 6px 12px)'
                      : colBg(c),
                  }}
                />
              )
            })}

            {/* Balken en de lijn van nu: één laag over alle kolommen. */}
            <div className="relative pointer-events-none" style={{ gridColumn: `2 / span ${n}`, gridRow: 1 }}>
              {nowPct !== null && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-[1]" style={{ left: `${nowPct}%` }} aria-hidden />
              )}
              {bars.map(bar => {
                const color = STATE_COLOR[bar.state]
                const warn = bar.endangered || bar.blocked
                const title = [
                  bar.label,
                  STATE_LABEL[bar.state],
                  bar.continuesBefore ? 'begint vroeger' : null,
                  bar.continuesAfter ? 'loopt verder door' : null,
                  bar.endangered ? 'In het gedrang: de vorige rit is nog niet terug' : null,
                  bar.blocked ? `Let op: ${block?.reason ?? 'wagen geblokkeerd'}` : null,
                ].filter(Boolean).join(' — ')
                return (
                  <div key={bar.reservationId}>
                    <button
                      onClick={() => onOpenReservation(bar.reservationId)}
                      title={title}
                      className="pointer-events-auto absolute flex items-center gap-1 px-1.5 overflow-hidden text-left hover:brightness-125 transition"
                      style={{
                        ...laneStyle(bar.lane),
                        left: `${bar.left}%`,
                        width: `max(${bar.visualWidth}%, 6px)`,
                        background: `${color}2e`,
                        border: warn ? '1.5px solid #ef4444' : `1px solid ${color}70`,
                        borderStyle: bar.endangered ? 'dashed' : 'solid',
                        borderRadius: `${bar.continuesBefore ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesBefore ? 0 : 6}px`,
                        opacity: bar.state === 'teruggebracht' ? 0.6 : 1,
                        boxShadow: bar.mine ? `inset 0 0 0 1px ${color}` : undefined,
                      }}
                    >
                      {/* Begint vroeger of loopt later door: een pijltje aan de rand. */}
                      {bar.continuesBefore && <ChevronLeft size={11} className="flex-shrink-0 -ml-1" style={{ color }} />}
                      {warn && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
                      {bar.state === 'te_laat' && <Clock size={10} className="text-red-400 flex-shrink-0" />}
                      <span className="flex-1 min-w-0 text-[11px] font-semibold truncate" style={{ color: bar.state === 'teruggebracht' ? '#a1a1aa' : color }}>{bar.label}</span>
                      {bar.continuesAfter && <ChevronRight size={11} className="flex-shrink-0 -mr-1" style={{ color }} />}
                    </button>
                    {bar.lateLeft !== null && bar.lateWidth !== null && bar.lateWidth > 0 && (
                      <div
                        className="absolute rounded-r"
                        title="Te laat: na de geplande terugkomst"
                        style={{
                          ...(lanes > 1 ? { top: 2 + bar.lane * LANE_H + LANE_H / 2 - 2, height: 3 } : { top: '45%', height: '10%' }),
                          left: `${bar.lateLeft}%`, width: `${bar.lateWidth}%`,
                          background: 'repeating-linear-gradient(90deg, #ef4444 0 4px, transparent 4px 7px)',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { STATE_COLOR, STATE_LABEL }
