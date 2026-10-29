'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, UserRound } from 'lucide-react'
import { DEFAULT_OWNER_NOTE, type EquipmentItem, type Reservation } from '@/components/equipment/types'

// Desktop-raster van de materiaalplanning: materiaal als rijen, dagen als
// kolommen. Een reservatie over meerdere dagen is één balk, vrije dagen
// blijven leeg. Op een telefoon toont de planner een daglijst in de plaats.

const NAME_W  = 240
const DAY_MIN = 34
const ROW_H   = 36
const CAT_H   = 30

interface CellLabel { text: string; color: string; isProject: boolean }

interface Props {
  days: Date[]
  todayISO: string
  categories: string[]
  equipment: EquipmentItem[]          // al gefilterd en gesorteerd
  catColor: (category: string) => string
  resMap: Map<string, Reservation>
  cellLabel: (res: Reservation) => CellLabel
  collapsed: Set<string>
  onToggleCategory: (category: string) => void
  searching: boolean
  dayProjects: Record<string, string>
  onSaveDayProject: (date: string, value: string) => void
  canReserveren: boolean
  canVerwijderen: boolean
  onReserve: (item: EquipmentItem, date: string) => void
  onOpenReservation: (item: EquipmentItem, date: string, res: Reservation) => void
  onInfo: (item: EquipmentItem) => void
  onDelete: (item: EquipmentItem) => void
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

function brusselsDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' })
}

// Rijen van één reservatie (zelfde stuk, zelfde ophaalmoment) die op
// opeenvolgende dagen liggen, worden één balk.
interface Segment { start: number; span: number; res: Reservation }

function segmentsFor(itemId: string, isoDays: string[], resMap: Map<string, Reservation>): Segment[] {
  const out: Segment[] = []
  const key = (r: Reservation) => r.pickup_datetime ?? r.id
  for (let i = 0; i < isoDays.length; i++) {
    const res = resMap.get(`${itemId}_${isoDays[i]}`)
    if (!res) continue
    const last = out[out.length - 1]
    if (last && last.start + last.span === i && key(last.res) === key(res)) last.span++
    else out.push({ start: i, span: 1, res })
  }
  return out
}

export default function EquipmentTimeline({
  days, todayISO, categories, equipment, catColor, resMap, cellLabel,
  collapsed, onToggleCategory, searching, dayProjects, onSaveDayProject,
  canReserveren, canVerwijderen, onReserve, onOpenReservation, onInfo, onDelete,
}: Props) {
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [editValue, setEditValue]   = useState('')

  const isoDays = useMemo(() => days.map(toISO), [days])
  const weekend = useMemo(() => days.map(d => d.getDay() === 0 || d.getDay() === 6), [days])
  const todayIdx = isoDays.indexOf(todayISO)

  const gridCols = `${NAME_W}px repeat(${days.length}, minmax(${DAY_MIN}px, 1fr))`
  const minWidth = NAME_W + days.length * DAY_MIN

  // Achtergrond per dagkolom: vandaag licht groen, weekend iets donkerder.
  function dayBg(i: number, owned = false) {
    if (i === todayIdx) return 'rgba(58,145,63,0.10)'
    if (owned) return 'rgba(245,158,11,0.04)'
    return weekend[i] ? 'rgba(255,255,255,0.025)' : 'transparent'
  }

  function saveDay(iso: string) {
    onSaveDayProject(iso, editValue.trim())
    setEditingDay(null)
  }

  return (
    <div style={{ minWidth }} className="text-zinc-300">
      {/* ── Dagen ── */}
      <div className="sticky top-0 z-20 grid bg-zinc-950 border-b border-zinc-800" style={{ gridTemplateColumns: gridCols }}>
        <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 px-4 flex items-end pb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Materiaal</span>
        </div>
        {days.map((d, i) => {
          const iso     = isoDays[i]
          const project = dayProjects[iso] ?? ''
          const isToday = i === todayIdx
          return (
            <div key={iso} className="relative border-r border-zinc-900" style={{ background: dayBg(i) }}>
              <button
                onClick={() => { setEditingDay(iso); setEditValue(project) }}
                title={project ? `Project: ${project} — klik om te wijzigen` : 'Klik om een project voor deze dag te noteren'}
                className="w-full flex flex-col items-center pt-2 pb-1.5 gap-0.5 hover:bg-zinc-900/60 transition-colors"
              >
                <span className={`text-[9px] uppercase tracking-wide ${weekend[i] ? 'text-zinc-600' : 'text-zinc-500'}`}>
                  {d.toLocaleDateString('nl-BE', { weekday: 'short' }).slice(0, 2)}
                </span>
                <span
                  className="text-xs font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full"
                  style={isToday ? { backgroundColor: '#3A913F', color: '#fff' } : { color: weekend[i] ? '#71717a' : '#d4d4d8' }}
                >
                  {d.getDate()}
                </span>
                {/* Project van de dag: een streepje, de naam staat in de tooltip. */}
                <span className="h-1 w-4 rounded-full" style={{ background: project ? '#a1a1aa' : 'transparent' }} />
              </button>
              {editingDay === iso && (
                <div className={`absolute top-full mt-1 z-40 w-48 p-2 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl ${i > days.length - 7 ? 'right-0' : 'left-0'}`}>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                    Project {d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
                  </p>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => saveDay(iso)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveDay(iso)
                      if (e.key === 'Escape') setEditingDay(null)
                    }}
                    placeholder="bv. Pro League matchday"
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Categorieën en materiaal ── */}
      {categories.map(cat => {
        const color  = catColor(cat)
        const items  = equipment.filter(e => e.category === cat)
        const isColl = !searching && collapsed.has(cat)

        return (
          <div key={cat}>
            <div className="grid border-b border-zinc-800/80" style={{ gridTemplateColumns: gridCols, height: CAT_H }}>
              <button
                onClick={() => onToggleCategory(cat)}
                className="sticky left-0 z-10 flex items-center gap-2 px-3 border-r border-zinc-800 text-left"
                style={{ background: `linear-gradient(90deg, ${color}26 0%, #09090b 100%), #09090b` }}
              >
                {isColl ? <ChevronRight size={12} style={{ color }} /> : <ChevronDown size={12} style={{ color }} />}
                <span className="text-[11px] font-bold uppercase tracking-widest truncate" style={{ color }}>{cat}</span>
                <span className="ml-auto text-[10px] text-zinc-600 flex-shrink-0">{items.length}</span>
              </button>
              {isoDays.map(iso => {
                // Dichtgeklapt: hoeveel stuks uit deze categorie die dag weg zijn.
                const count = isColl ? items.filter(it => resMap.has(`${it.id}_${iso}`)).length : 0
                return (
                  <div key={iso} className="flex items-center justify-center border-r border-zinc-900"
                    style={{ background: `${color}0d` }}>
                    {count > 0 && (
                      <span className="text-[10px] font-bold" style={{ color }} title={`${count} van ${items.length} weg`}>{count}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {!isColl && items.map(item => {
              const owned = !!item.owner
              const segs  = segmentsFor(item.id, isoDays, resMap)
              return (
                <div key={item.id} className="grid border-b border-zinc-900 group/row" style={{ gridTemplateColumns: gridCols, height: ROW_H }}>
                  {/* Naam */}
                  <div className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800 flex items-center gap-2 pl-3 pr-2 min-w-0"
                    style={{ gridColumn: 1, gridRow: 1 }}>
                    <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <button
                      onClick={() => onInfo(item)}
                      title={`${item.name}${item.description ? ` — ${item.description}` : ''}`}
                      className={`text-[13px] truncate text-left hover:underline ${item.is_broken ? 'line-through text-zinc-600' : 'text-zinc-200'}`}
                    >
                      {item.name}
                    </button>
                    {item.is_broken && (
                      <span title={item.broken_note || 'Defect gemeld'}
                        className="flex-shrink-0 px-1 rounded text-[9px] font-bold uppercase text-red-400 border border-red-500/40 bg-red-500/10">
                        defect
                      </span>
                    )}
                    {owned && (
                      <span title={`${item.owner_note || DEFAULT_OWNER_NOTE} Verantwoordelijke: ${item.owner}`}
                        className="flex-shrink min-w-0 inline-flex items-center gap-0.5 px-1.5 rounded text-[10px] text-amber-300 border border-amber-500/30 bg-amber-500/10">
                        <UserRound size={9} className="flex-shrink-0" />
                        <span className="truncate">{item.owner}</span>
                      </span>
                    )}
                    {canVerwijderen && (
                      <button
                        onClick={() => onDelete(item)}
                        title="Materiaal verwijderen"
                        aria-label={`${item.name} verwijderen`}
                        className="ml-auto flex-shrink-0 p-1 rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition-opacity"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>

                  {/* Dagvakjes: leeg = vrij, klik om te reserveren */}
                  {isoDays.map((iso, i) => {
                    const past      = iso < todayISO
                    const clickable = !past && canReserveren && !item.is_broken && !resMap.has(`${item.id}_${iso}`)
                    return (
                      <div
                        key={iso}
                        onClick={clickable ? () => onReserve(item, iso) : undefined}
                        title={clickable ? `${item.name} reserveren op ${days[i].toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}` : undefined}
                        className={`border-r border-zinc-900 group/cell flex items-center justify-center ${clickable ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
                        style={{ gridColumn: i + 2, gridRow: 1, background: dayBg(i, owned) }}
                      >
                        {clickable && <span className="text-xs text-zinc-500 opacity-0 group-hover/cell:opacity-100">+</span>}
                      </div>
                    )
                  })}

                  {/* Reservaties als balken over de dagvakjes heen */}
                  {segs.map(seg => {
                    const label = cellLabel(seg.res)
                    const fromBefore = seg.start === 0 && !!seg.res.pickup_datetime && brusselsDate(seg.res.pickup_datetime) < isoDays[0]
                    const intoAfter  = seg.start + seg.span === isoDays.length && !!seg.res.return_datetime && brusselsDate(seg.res.return_datetime) > isoDays[isoDays.length - 1]
                    const past = isoDays[seg.start + seg.span - 1] < todayISO
                    return (
                      <button
                        key={`${seg.res.id}-${seg.start}`}
                        onClick={() => onOpenReservation(item, isoDays[seg.start], seg.res)}
                        title={`${seg.res.reserved_by}${seg.res.project ? ` — ${seg.res.project}` : ''}${seg.res.note ? ` — ${seg.res.note}` : ''}`}
                        className="relative z-[1] my-1 mx-px flex items-center px-2 overflow-hidden text-left hover:brightness-125 transition"
                        style={{
                          gridColumn: `${seg.start + 2} / span ${seg.span}`,
                          gridRow: 1,
                          background: `${label.color}2e`,
                          border: `1px solid ${label.color}70`,
                          borderRadius: `${fromBefore ? 0 : 6}px ${intoAfter ? 0 : 6}px ${intoAfter ? 0 : 6}px ${fromBefore ? 0 : 6}px`,
                          opacity: past ? 0.55 : 1,
                        }}
                      >
                        <span className="text-[11px] font-semibold truncate" style={{ color: label.color }}>
                          {label.text}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
