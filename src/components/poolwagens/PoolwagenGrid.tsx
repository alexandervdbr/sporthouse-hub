'use client'

import { AlertTriangle, Ban, Clock } from 'lucide-react'
import { useGridSelection } from '@/components/materiaal/useGridSelection'
import type { GridCarRow } from '@/lib/poolwagens/grid'

// Het raster: wagens als rijen, dagen als kolommen — dezelfde oriëntatie en
// maten als de materiaalplanner. De balken staan op het uur (links/breedte in
// procent, uitgerekend in src/lib/poolwagens/grid.ts); dit tekent alleen.

const NAME_W  = 248
const DAY_MIN = 34
const ROW_H   = 40

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
  days: string[]
  today: string
  rows: GridCarRow[]
  canBook: boolean
  onSelectRange: (carId: string, fromIndex: number, toIndex: number) => void
  onOpenReservation: (id: string) => void
}

function dayHeader(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return { weekday: d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2), day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6 }
}

export default function PoolwagenGrid({ days, today, rows, canBook, onSelectRange, onOpenReservation }: Props) {
  const selection = useGridSelection(onSelectRange)
  const headers = days.map(dayHeader)
  const todayIdx = days.indexOf(today)
  const cols = `${NAME_W}px repeat(${days.length}, minmax(${DAY_MIN}px, 1fr))`
  const dayBg = (i: number) =>
    i === todayIdx ? 'rgba(58,145,63,0.10)' : headers[i].weekend ? 'rgba(255,255,255,0.025)' : 'transparent'

  return (
    <div style={{ minWidth: NAME_W + days.length * DAY_MIN }} className={selection.selecting ? 'select-none' : ''}>
      <div className="sticky top-0 z-20 grid bg-zinc-950 border-b border-zinc-800" style={{ gridTemplateColumns: cols }}>
        <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-4 flex items-end pb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Poolwagens</span>
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

      {rows.map(({ car, block, bars }) => {
        const bookable = canBook && !block
        return (
          <div key={car.id} className="grid border-b border-zinc-900" style={{ gridTemplateColumns: cols, height: ROW_H }}>
            <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-2 pl-3 pr-2 min-w-0" style={{ gridColumn: 1, gridRow: 1 }}
              title={block ? block.reason : `${car.name} — ${car.license_plate}`}>
              <span className="w-0.5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: block ? '#ef4444' : '#3A913F' }} />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] truncate ${block ? 'text-zinc-500' : 'text-zinc-200'}`}>{car.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono truncate">{car.license_plate}</div>
              </div>
              {block && (
                <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 rounded text-[9px] font-bold uppercase text-red-400 border border-red-500/40 bg-red-500/10">
                  <Ban size={9} /> {block.kind === 'schade' ? 'schade' : 'niet beschikbaar'}
                </span>
              )}
            </div>

            {days.map((iso, i) => {
              const free = bookable && iso >= today
              const selected = selection.isSelected(car.id, i)
              return (
                <div key={iso}
                  onPointerDown={free ? e => { if (e.button === 0) selection.start(car.id, i) } : undefined}
                  onPointerEnter={free ? () => selection.extend(car.id, i) : undefined}
                  className={`border-r border-zinc-900 ${free ? 'cursor-pointer hover:bg-zinc-800/40' : ''}`}
                  style={{
                    gridColumn: i + 2, gridRow: 1,
                    background: selected ? 'rgba(58,145,63,0.35)'
                      : block ? 'repeating-linear-gradient(135deg, rgba(239,68,68,0.06) 0 6px, transparent 6px 12px)'
                      : dayBg(i),
                  }}
                />
              )
            })}

            {/* Balken: één laag over alle dagkolommen, op het uur geplaatst. */}
            <div className="relative pointer-events-none" style={{ gridColumn: `2 / span ${days.length}`, gridRow: 1 }}>
              {bars.map(bar => {
                const color = STATE_COLOR[bar.state]
                const warn = bar.endangered || bar.blocked
                const title = [
                  bar.label,
                  STATE_LABEL[bar.state],
                  bar.endangered ? 'In het gedrang: de vorige rit is nog niet terug' : null,
                  bar.blocked ? `Let op: ${block?.reason ?? 'wagen geblokkeerd'}` : null,
                ].filter(Boolean).join(' — ')
                return (
                  <div key={bar.reservationId}>
                    <button
                      onClick={() => onOpenReservation(bar.reservationId)}
                      title={title}
                      className="pointer-events-auto absolute top-1 bottom-1 flex items-center gap-1 px-1.5 overflow-hidden text-left hover:brightness-125 transition"
                      style={{
                        left: `${bar.left}%`,
                        width: `max(${bar.width}%, 6px)`,
                        background: `${color}2e`,
                        border: warn ? '1.5px solid #ef4444' : `1px solid ${color}70`,
                        borderStyle: bar.endangered ? 'dashed' : 'solid',
                        borderRadius: `${bar.continuesBefore ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesAfter ? 0 : 6}px ${bar.continuesBefore ? 0 : 6}px`,
                        opacity: bar.state === 'teruggebracht' ? 0.6 : 1,
                        boxShadow: bar.mine ? `inset 0 0 0 1px ${color}` : undefined,
                      }}
                    >
                      {warn && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
                      {bar.state === 'te_laat' && <Clock size={10} className="text-red-400 flex-shrink-0" />}
                      <span className="text-[11px] font-semibold truncate" style={{ color: bar.state === 'teruggebracht' ? '#a1a1aa' : color }}>{bar.label}</span>
                    </button>
                    {bar.lateLeft !== null && bar.lateWidth !== null && bar.lateWidth > 0 && (
                      <div
                        className="absolute top-[45%] h-[10%] rounded-r"
                        title="Te laat: na de geplande terugkomst"
                        style={{ left: `${bar.lateLeft}%`, width: `${bar.lateWidth}%`, background: 'repeating-linear-gradient(90deg, #ef4444 0 4px, transparent 4px 7px)' }}
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
