'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import EquipmentAdminPanel, { type AdminTab } from '@/components/equipment/EquipmentAdminPanel'
import EquipmentTimeline from '@/components/equipment/EquipmentTimeline'
import {
  DEFAULT_OWNER_NOTE,
  type EquipmentItem, type EquipmentCategory, type EquipmentProject, type Reservation,
} from '@/components/equipment/types'
import { isAdminUser } from '@/lib/auth-permissions'
import {
  ChevronLeft, ChevronRight, ChevronDown,
  X, Loader2, AlertCircle, Trash2, BarChart3, Search, Calendar, Plus, Settings, UserRound, Camera
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─── User colours ─────────────────────────────────────────────────────────────

const USER_COLORS = [
  '#3b82f6','#f59e0b','#ec4899','#8b5cf6','#14b8a6',
  '#f97316','#22d3ee','#a3e635','#fb923c','#34d399','#e879f9','#60a5fa',
]

const USER_COLOR_OVERRIDES: Record<string, string> = {
  'FoS': '#f97316',
}

function getUserColor(name: string): string {
  if (USER_COLOR_OVERRIDES[name]) return USER_COLOR_OVERRIDES[name]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}

function getFirstName(name: string): string {
  if (name.includes('@')) return name.split('@')[0]
  const parts = name.split(' ')
  // If first word is very short (like "De"), show the full name
  if (parts.length === 1 || parts[0].length <= 3) return name
  return parts[0]
}

// ─── Category colours ─────────────────────────────────────────────────────────

// Categorieën, kleuren en volgorde komen uit Beheer (equipment_categories).
type CatColor = (category: string) => string
const FALLBACK_CAT_COLOR = '#3A913F'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// "13 aug" — compact enough for the two history lines under each item.
function shortDate(iso: string) {
  return new Date(iso + 'T12:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

function getDayName(date: Date) {
  return date.toLocaleDateString('nl-BE', { weekday: 'short' })
}

function isWeekend(date: Date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

// Format a stored datetime string for display (Brussels timezone)
function formatDT(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const day  = d.toLocaleDateString('nl-BE',  { timeZone: 'Europe/Brussels', weekday: 'short', day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('nl-BE',  { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

// Compute occupied dates from pickup/return (client-side, local time)
function getOccupiedDates(pickupDate: string, pickupTime: string, returnDate: string, returnTime: string): string[] {
  if (!pickupDate || !pickupTime || !returnDate || !returnTime) return []
  const [rh, rm] = returnTime.split(':').map(Number)
  const retAfter1030 = rh > 10 || (rh === 10 && rm > 30)
  const dates: string[] = []
  const cur = new Date(`${pickupDate}T12:00:00`)
  const end = new Date(`${returnDate}T12:00:00`)
  if (isNaN(cur.getTime()) || isNaN(end.getTime()) || end < cur) return []
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    const iso = `${y}-${m}-${d}`
    if (iso !== returnDate || retAfter1030) dates.push(iso)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// Build ISO datetime with local timezone offset (avoids UTC ambiguity). The
// offset is the one on that date, not today's: across a clock change they
// differ by an hour.
function makeISO(date: string, time: string): string {
  const offset = -(new Date(`${date}T${time}:00`).getTimezoneOffset())
  const h = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')
  const m = (Math.abs(offset) % 60).toString().padStart(2, '0')
  const sign = offset >= 0 ? '+' : '-'
  return `${date}T${time}:00${sign}${h}:${m}`
}

const MONTH_NAMES = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]

// ─── Modal base ───────────────────────────────────────────────────────────────

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl ${wide ? 'w-full max-w-lg' : 'w-full max-w-sm'}`}>
        {children}
      </div>
    </div>
  )
}

// ─── Equipment Info Modal ─────────────────────────────────────────────────────

function OwnerNotice({ item }: { item: EquipmentItem }) {
  if (!item.owner) return null
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
      <UserRound size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-amber-200">{item.owner_note || DEFAULT_OWNER_NOTE}</p>
        <p className="text-[11px] text-amber-400/80 mt-0.5">Verantwoordelijke · {item.owner}</p>
      </div>
    </div>
  )
}

function EquipmentInfoModal({ item, catColor, onClose }: { item: EquipmentItem; catColor: CatColor; onClose: () => void }) {
  const color = catColor(item.category)
  return (
    <Modal onClose={onClose}>
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color }}>{item.category}</p>
          <h2 className="text-sm font-semibold text-zinc-100">{item.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5 flex-shrink-0">
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <OwnerNotice item={item} />
        {item.description ? (
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Inhoud set</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{item.description}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 italic">Geen inhoud opgegeven voor dit materiaal.</p>
        )}
      </div>
      <div className="px-5 py-3 border-t border-zinc-800">
        <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Sluiten</button>
      </div>
    </Modal>
  )
}

// ─── Reservation Create Modal ─────────────────────────────────────────────────

interface CreateModalProps {
  equipment: EquipmentItem[]
  resMap: Map<string, Reservation>
  // Every reservation, so the modal can show each chosen item's previous and
  // next booking relative to the dates being picked.
  allReservations: Reservation[]
  projects: EquipmentProject[]
  // Namen om voor te reserveren: collega's en wie al eens reserveerde.
  people: string[]
  currentUser: string
  catColor: CatColor
  initialEquipment?: EquipmentItem
  initialDate?: string
  onClose: () => void
  onCreated: (reservations: Reservation[]) => void
}

function ReservationCreateModal({ equipment, resMap, allReservations, projects, people, currentUser, catColor, initialEquipment, initialDate, onClose, onCreated }: CreateModalProps) {
  const today = toISO(new Date())

  const [query,       setQuery]       = useState('')
  // A shoot usually needs several items on the same dates, so one reservation
  // can cover a list rather than forcing a trip through the modal per item.
  const [selected,    setSelected]    = useState<EquipmentItem[]>(initialEquipment ? [initialEquipment] : [])
  const [pickupDate,  setPickupDate]  = useState(initialDate ?? today)
  const [pickupTime,  setPickupTime]  = useState('09:00')
  const [returnDate,  setReturnDate]  = useState(initialDate ?? today)
  const [returnTime,  setReturnTime]  = useState('17:00')
  const [project,     setProject]     = useState('')
  const [note,        setNote]        = useState('')
  // Leeg = voor jezelf. Wie reserveert voor een collega, typt of kiest diens naam.
  const [reserveFor,  setReserveFor]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const chosen = new Set(selected.map(s => s.id))
    return equipment
      .filter(e => !chosen.has(e.id) && !e.is_broken)
      .filter(e => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, equipment, selected])

  const occupiedDates = useMemo(
    () => getOccupiedDates(pickupDate, pickupTime, returnDate, returnTime),
    [pickupDate, pickupTime, returnDate, returnTime]
  )

  // Per chosen item: who had it last before this pickup, and who gets it next
  // after this return. Measured against the dates in the form, so it updates
  // as you change them.
  const history = useMemo(() => {
    const map = new Map<string, { last?: Reservation; next?: Reservation }>()
    for (const r of allReservations) {
      const entry = map.get(r.equipment_id) ?? {}
      if (r.date < pickupDate) {
        if (!entry.last || r.date > entry.last.date) entry.last = r
      } else if (r.date > returnDate) {
        if (!entry.next || r.date < entry.next.date) entry.next = r
      }
      map.set(r.equipment_id, entry)
    }
    return map
  }, [allReservations, pickupDate, returnDate])

  // Which of the chosen items are already booked on any of these dates.
  const conflicts = useMemo(
    () => selected
      .map(item => ({ item, dates: occupiedDates.filter(d => resMap.has(`${item.id}_${d}`)) }))
      .filter(c => c.dates.length > 0),
    [selected, occupiedDates, resMap]
  )

  async function handleSubmit() {
    if (selected.length === 0) { setError('Selecteer eerst materiaal.'); return }
    if (!pickupDate || !returnDate) { setError('Vul een datum in.'); return }
    setSaving(true); setError('')
    try {
      const created: Reservation[] = []
      const failed: string[] = []

      // Sequential rather than parallel: the API checks for conflicts per
      // request, and firing them at once can let two items race past the
      // same check.
      for (const item of selected) {
        const r = await fetch('/api/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            equipment_id:     item.id,
            pickup_datetime:  makeISO(pickupDate, pickupTime),
            return_datetime:  makeISO(returnDate, returnTime),
            project,
            note,
            reserved_for: reserveFor.trim() || undefined,
          }),
        })
        const data = await r.json()
        if (!r.ok) { failed.push(`${item.name}: ${data.error || 'onbekende fout'}`); continue }
        created.push(...(Array.isArray(data) ? data : [data]))
      }

      if (created.length) onCreated(created)
      if (failed.length) {
        // Keep the modal open so what did land isn't lost and the rest is clear.
        setError(`Niet alles is gelukt — ${failed.join(' · ')}`)
        setSelected(prev => prev.filter(i => failed.some(f => f.startsWith(`${i.name}:`))))
      } else {
        onClose()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan')
    }
    setSaving(false)
  }

  const inPast    = !!pickupDate && pickupDate < today
  const canSubmit = selected.length > 0 && !!pickupDate && !!returnDate && occupiedDates.length > 0 && conflicts.length === 0 && !inPast

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Materiaal reserveren</h2>
        <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

        {/* Equipment search */}
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
            Materiaal{selected.length > 1 && <span className="ml-1 text-zinc-400 normal-case">· {selected.length} gekozen</span>}
          </label>

          {/* Chosen items */}
          {selected.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {selected.map(item => {
                const c = catColor(item.category)
                const itemConflict = conflicts.find(cf => cf.item.id === item.id)
                return (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{
                      background: itemConflict ? 'rgba(220,38,38,0.10)' : `${c}15`,
                      border: `1px solid ${itemConflict ? 'rgba(220,38,38,0.35)' : `${c}35`}`,
                    }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: itemConflict ? '#f87171' : c }}>
                          {itemConflict ? `Bezet op ${itemConflict.dates.length} van deze dagen` : item.category}
                        </p>
                        {/* Who had it before, who gets it after — the same
                            context the Materiaal tab gives. */}
                        <p className="text-[10px] leading-relaxed text-zinc-500 mt-0.5">
                          {(() => {
                            const h = history.get(item.id)
                            const parts: string[] = []
                            if (h?.last) parts.push(`Laatst: ${getFirstName(h.last.reserved_by)} · ${shortDate(h.last.date)}`)
                            if (h?.next) parts.push(`Daarna: ${getFirstName(h.next.reserved_by)} · ${shortDate(h.next.date)}`)
                            return parts.length ? parts.join('   ') : 'Geen andere reservaties'
                          })()}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setSelected(prev => prev.filter(i => i.id !== item.id))}
                      aria-label={`${item.name} verwijderen`}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors ml-2 flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Materiaal met een vaste verantwoordelijke: wel te reserveren,
              maar in samenspraak. */}
          {selected.some(i => i.owner) && (
            <div className="space-y-1.5 mb-2">
              {selected.filter(i => i.owner).map(item => (
                <div key={item.id}>
                  {selected.filter(i => i.owner).length > 1 && <p className="text-[10px] text-zinc-500 mb-0.5">{item.name}</p>}
                  <OwnerNotice item={item} />
                </div>
              ))}
            </div>
          )}

          {/* Search stays available so more items can be added */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus={selected.length === 0}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={selected.length ? 'Nog materiaal toevoegen…' : 'Zoek materiaal…'}
              className="w-full pl-8 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
            {filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden z-10 shadow-xl">
                {filtered.map(item => {
                  const c = catColor(item.category)
                  return (
                    <button key={item.id} onClick={() => { setSelected(prev => [...prev, item]); setQuery('') }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800 transition-colors text-left">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      <span className="text-sm text-zinc-200 flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] uppercase tracking-wider flex-shrink-0" style={{ color: c }}>{item.category}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Set contents, only when a single item is chosen */}
          {selected.length === 1 && selected[0].description && (
            <div className="mt-2 px-3 py-2 bg-zinc-800/60 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Inhoud set</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{selected[0].description}</p>
            </div>
          )}
        </div>

        {/* Datetime */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              <span className="flex items-center gap-1"><Calendar size={11} /> Ophalen</span>
            </label>
            <input type="date" value={pickupDate} min={today}
              onChange={e => {
                setPickupDate(e.target.value)
                // Terugbrengen kan niet vóór ophalen.
                if (returnDate < e.target.value) setReturnDate(e.target.value)
              }}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
            <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              <span className="flex items-center gap-1"><Calendar size={11} /> Terugbrengen</span>
            </label>
            <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
              min={pickupDate}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
            <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>
        </div>

        {/* Occupied days preview */}
        {occupiedDates.length > 0 && (
          <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
              Bezette {occupiedDates.length === 1 ? 'dag' : 'dagen'} · {occupiedDates.length}
              <span className="ml-1 normal-case text-zinc-600">(terugbrengen na 10:30 = volledige dag)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {occupiedDates.map(d => {
                // A day counts as blocked if any of the chosen items is taken.
                const blocked = selected.filter(item => resMap.has(`${item.id}_${d}`))
                const isConflict = blocked.length > 0
                const conflictRes = isConflict ? resMap.get(`${blocked[0].id}_${d}`) : undefined
                return (
                  <span key={d}
                    className="px-2 py-0.5 rounded text-[11px] font-medium"
                    style={isConflict
                      ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                      : { background: 'rgba(58,145,63,0.15)', color: '#4ade80', border: '1px solid rgba(58,145,63,0.3)' }
                    }
                    title={isConflict ? `Bezet door ${conflictRes?.reserved_by}` : 'Vrij'}
                  >
                    {new Date(d + 'T12:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
                    {isConflict && ' ✕'}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Project + note */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Voor wie?</label>
            <input type="text" value={reserveFor} onChange={e => setReserveFor(e.target.value)}
              list="reserve-for-options"
              placeholder={currentUser ? `${currentUser} (jezelf)` : 'Jezelf'}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" />
            <datalist id="reserve-for-options">
              {people.filter(n => n !== currentUser).map(n => <option key={n} value={n} />)}
            </datalist>
            {reserveFor.trim() && reserveFor.trim() !== currentUser && (
              <p className="mt-1 text-[11px] text-zinc-500">Op naam van {reserveFor.trim()}, ingegeven door jou.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Project</label>
            {/* Vaste projecten als knopjes, maar het veld blijft vrije tekst:
                een eenmalige shoot hoeft niet eerst aangemaakt te worden. */}
            {projects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {projects.map(p => {
                  const active = project.trim().toLowerCase() === p.name.toLowerCase()
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProject(active ? '' : p.name)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={active
                        ? { backgroundColor: `${p.color}25`, border: `1px solid ${p.color}`, color: p.color }
                        : { backgroundColor: 'transparent', border: '1px solid #3f3f46', color: '#a1a1aa' }}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            )}
            <input type="text" value={project} onChange={e => setProject(e.target.value)}
              placeholder="bijv. Pro League — matchday"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              Notitie <span className="text-zinc-700 normal-case">(optioneel)</span>
            </label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Aanvullende info…"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors" />
          </div>
        </div>

        {/* Error */}
        {(error || conflicts.length > 0 || inPast) && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">
              {error || (inPast ? 'Ophalen ligt in het verleden.' : conflicts.length === 1
                ? `${conflicts[0].item.name} is al gereserveerd op ${conflicts[0].dates.length} van deze ${conflicts[0].dates.length === 1 ? 'dag' : 'dagen'}.`
                : `${conflicts.length} items zijn al gereserveerd op een of meer van deze dagen.`)}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Annuleren
        </button>
        <button onClick={handleSubmit} disabled={saving || !canSubmit}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#3A913F' }}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {selected.length > 1 ? `${selected.length} reserveren` : 'Reserveren'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Reservation View Modal ───────────────────────────────────────────────────

interface ViewModalProps {
  equipment: EquipmentItem
  date: string
  reservation: Reservation
  currentUser: string
  isAdmin: boolean
  canDeleteReservation: boolean
  catColor: CatColor
  onClose: () => void
  onDeleted: (reservationId: string, equipmentId: string, pickupDatetime: string | null) => void
}

function ReservationViewModal({ equipment, reservation: res, currentUser, isAdmin, canDeleteReservation, catColor, onClose, onDeleted }: ViewModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')
  const color     = catColor(equipment.category)
  const userColor = getUserColor(res.reserved_by)

  // Compute all occupied days for this reservation (for display)
  const allDays = useMemo(() => {
    if (!res.pickup_datetime || !res.return_datetime) return [res.date]
    const pickup = new Date(res.pickup_datetime)
    const ret    = new Date(res.return_datetime)
    const pd = pickup.toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short' })
    const rd = ret.toLocaleDateString('nl-BE',    { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short' })
    if (pd === rd) return [pd]
    return [pd, rd]
  }, [res])

  async function handleDelete() {
    setDeleting(true)
    try {
      const r = await fetch(`/api/reservations/${res.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.text()) || 'Fout bij verwijderen')
      onDeleted(res.id, res.equipment_id, res.pickup_datetime)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen')
    }
    setDeleting(false)
  }

  // Wie voor een collega reserveerde, mag die reservatie ook weer annuleren.
  const canDelete = isAdmin || canDeleteReservation || res.reserved_by === currentUser || res.created_by === currentUser

  return (
    <Modal onClose={onClose}>
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color }}>{equipment.category}</p>
          <h2 className="text-sm font-semibold text-zinc-100">{equipment.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5 flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Who */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-xl"
          style={{ background: `${userColor}12`, border: `1px solid ${userColor}28` }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: userColor }} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">{res.reserved_by}</p>
            {res.created_by && res.created_by !== res.reserved_by && (
              <p className="text-[11px] text-zinc-500">Gereserveerd door {res.created_by}</p>
            )}
          </div>
        </div>

        <OwnerNotice item={equipment} />

        {/* Times */}
        {(res.pickup_datetime || res.return_datetime) && (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Ophalen</span>
              <span className="text-xs text-zinc-300">{formatDT(res.pickup_datetime)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Terugbrengen</span>
              <span className="text-xs text-zinc-300">{formatDT(res.return_datetime)}</span>
            </div>
            {allDays.length > 1 && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Bezette dagen</span>
                <span className="text-xs text-zinc-400">{allDays.join(' → ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Project */}
        {res.project && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Project</span>
            <span className="text-xs text-zinc-300 font-medium">{res.project}</span>
          </div>
        )}

        {/* Note */}
        {res.note && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Notitie</span>
            <span className="text-xs text-zinc-400">{res.note}</span>
          </div>
        )}

        {/* Equipment description */}
        {equipment.description && (
          <div className="px-3 py-2.5 bg-zinc-800/60 rounded-lg">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Inhoud set</p>
            <p className="text-xs text-zinc-400 leading-relaxed">{equipment.description}</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/50 border border-red-900/40 rounded-lg transition-colors disabled:opacity-50">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Verwijderen
          </button>
        )}
        <button onClick={onClose} className="ml-auto px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          Sluiten
        </button>
      </div>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EquipmentPlanner() {
  const today = new Date()
  const [year,               setYear]               = useState(today.getFullYear())
  const [month,              setMonth]              = useState(today.getMonth())
  const [equipment,          setEquipment]          = useState<EquipmentItem[]>([])
  const [equipmentLoaded,    setEquipmentLoaded]    = useState(false)
  const [dbCategories,       setDbCategories]       = useState<EquipmentCategory[]>([])
  const [teamNames,          setTeamNames]          = useState<string[]>([])
  const [projects,           setProjects]           = useState<EquipmentProject[]>([])
  const [reservations,       setReservations]       = useState<Reservation[]>([])
  const [dayProjects,        setDayProjects]        = useState<Record<string, string>>({})
  const [loading,            setLoading]            = useState(true)
  const [currentUser,        setCurrentUser]        = useState('')
  const [isAdmin,            setIsAdmin]            = useState(false)
  const [collapsedCategories,setCollapsedCategories] = useState<Set<string>>(new Set())
  const [searchQuery,        setSearchQuery]        = useState('')
  const [canReserveren,           setCanReserveren]           = useState(true)
  const [canToevoegen,            setCanToevoegen]            = useState(false)
  const [canVerwijderen,          setCanVerwijderen]          = useState(false)
  const [canReserveringVerwijderen, setCanReserveringVerwijderen] = useState(false)
  const [canStats,                setCanStats]                = useState(false)
  const [canExtern,               setCanExtern]               = useState(false)

  // Modals
  const [viewModal,      setViewModal]      = useState<{ equipment: EquipmentItem; date: string; reservation: Reservation } | null>(null)
  const [createModal,    setCreateModal]    = useState<{ equipment?: EquipmentItem; date?: string } | null>(null)
  const [infoItem,       setInfoItem]       = useState<EquipmentItem | null>(null)
  const [adminPanel,     setAdminPanel]     = useState<{ tab: AdminTab; category?: string } | null>(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState<EquipmentItem | null>(null)
  const [deleting,       setDeleting]       = useState(false)
  const [deleteError,    setDeleteError]    = useState('')
  const [menuOpen,       setMenuOpen]       = useState(false)

  const daysInMonth   = getDaysInMonth(year, month)
  const days          = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  const startISO      = toISO(new Date(year, month, 1))
  const endISO        = toISO(new Date(year, month, daysInMonth))
  const todayISO      = toISO(today)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  // Load user + role + permissions
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const meta = user.user_metadata ?? {}
      setCurrentUser(meta.full_name ?? meta.name ?? meta.email ?? user.email ?? '')
      const permsObj = user.app_metadata?.permissions ?? null
      const sections: string[] = permsObj?.sections ?? []
      const admin = isAdminUser(user)
      setIsAdmin(admin)
      const unrestricted = admin || permsObj === null
      setCanReserveren(unrestricted || sections.includes('materiaal_reserveren'))
      setCanToevoegen(admin || (permsObj === null) || sections.includes('materiaal_toevoegen'))
      setCanVerwijderen(admin || (permsObj === null) || sections.includes('materiaal_verwijderen'))
      setCanReserveringVerwijderen(admin || (permsObj === null) || sections.includes('reservering_verwijderen'))
      setCanStats(admin || (permsObj === null) || sections.includes('stats_materiaal'))
      setCanExtern(admin || (permsObj === null) || sections.includes('materiaal_extern'))
    })
  }, [])

  // Load equipment, categories, projects and the team once
  useEffect(() => {
    fetch('/api/equipment')
      .then(r => r.ok ? r.json() : [])
      .then((rows: EquipmentItem[]) => setEquipment(Array.isArray(rows) ? rows : []))
      .catch(console.error)
      .finally(() => setEquipmentLoaded(true))
    fetch('/api/equipment-categories').then(r => r.ok ? r.json() : []).then(setDbCategories).catch(() => {})
    fetch('/api/equipment-projects').then(r => r.json()).then(setProjects).catch(() => {})
    // Alleen voor de suggesties bij "Voor wie?" en de verantwoordelijke.
    fetch('/api/team/members')
      .then(r => r.ok ? r.json() : [])
      .then((rows: { name: string; active?: boolean }[]) =>
        setTeamNames(rows.filter(r => r.active !== false && r.name).map(r => r.name)))
      .catch(() => {})
  }, [])

  // Load day projects
  const loadDayProjects = useCallback(async () => {
    try {
      const r = await fetch(`/api/day-projects?start=${startISO}&end=${endISO}`)
      const data: { date: string; project_name: string }[] = await r.json()
      const map: Record<string, string> = {}
      for (const d of data) map[d.date] = d.project_name
      setDayProjects(map)
    } catch (e) { console.error(e) }
  }, [startISO, endISO])

  useEffect(() => { loadDayProjects() }, [loadDayProjects])

  async function saveProjectName(date: string, value: string) {
    setDayProjects(prev => ({ ...prev, [date]: value }))
    try {
      await fetch('/api/day-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, project_name: value }),
      })
    } catch (e) { console.error(e) }
  }

  // Load reservations
  const loadReservations = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reservations?start=${startISO}&end=${endISO}`)
      setReservations(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [startISO, endISO])

  useEffect(() => { loadReservations() }, [loadReservations])

  // Both lists change together: the grid shows this month, the "Laatst /
  // Daarna" lines read from everything.
  function handleCreated(newRes: Reservation[]) {
    setReservations(prev => [...prev, ...newRes])
    setAllReservations(prev => [...prev, ...newRes])
  }

  function handleDeleted(reservationId: string, equipmentId: string, pickupDatetime: string | null) {
    const keep = (r: Reservation) => pickupDatetime
      ? !(r.equipment_id === equipmentId && r.pickup_datetime === pickupDatetime)
      : r.id !== reservationId
    setReservations(prev => prev.filter(keep))
    setAllReservations(prev => prev.filter(keep))
  }

  async function handleEquipmentDelete(item: EquipmentItem) {
    setDeleting(true); setDeleteError('')
    try {
      const r = await fetch('/api/equipment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      // Bv. nog reservaties: dan blijft het staan en zeggen we waarom.
      if (!r.ok) throw new Error((await r.text()) || 'Verwijderen mislukt')
      setEquipment(prev => prev.filter(e => e.id !== item.id))
      setDeleteConfirm(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Verwijderen mislukt')
    }
    setDeleting(false)
  }

  // Lookup map
  const resMap = useMemo(() => {
    const m = new Map<string, Reservation>()
    for (const r of reservations) m.set(`${r.equipment_id}_${r.date}`, r)
    return m
  }, [reservations])

  const visibleEquipment = useMemo(() => {
    // Defect materiaal verdwijnt uit het raster, behalve voor beheerders — die
    // moeten het kunnen terugzetten zodra het hersteld is.
    const pool = (canToevoegen ? equipment : equipment.filter(e => !e.is_broken))
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    if (!searchQuery.trim()) return pool
    const q = searchQuery.toLowerCase()
    return pool.filter(e =>
      e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) ||
      (e.owner ?? '').toLowerCase().includes(q)
    )
  }, [equipment, searchQuery, canToevoegen])

  // Projectnaam -> project, om reservaties in het raster op projectnaam en
  // -kleur te kunnen tonen in plaats van op persoon.
  const projectByName = useMemo(() => {
    const m = new Map<string, EquipmentProject>()
    for (const p of projects) m.set(p.name.toLowerCase(), p)
    return m
  }, [projects])

  // Wat een cel toont: het project als dat zo ingesteld staat, anders de persoon.
  const cellLabel = useCallback((res: Reservation) => {
    const p = res.project ? projectByName.get(res.project.toLowerCase()) : undefined
    if (p?.show_in_planner) return { text: p.name, color: p.color, isProject: true }
    return { text: getFirstName(res.reserved_by), color: getUserColor(res.reserved_by), isProject: false }
  }, [projectByName])

  // Volgorde en kleur uit Beheer. Materiaal waarvan de categorie (nog) niet in
  // die lijst staat, komt achteraan in plaats van onzichtbaar te zijn.
  const catColor = useCallback<CatColor>(
    cat => dbCategories.find(c => c.name === cat)?.color ?? FALLBACK_CAT_COLOR,
    [dbCategories]
  )
  const categories = useMemo(() => {
    const known = dbCategories.map(c => c.name)
    const extra = Array.from(new Set(equipment.map(e => e.category))).filter(c => !known.includes(c)).sort()
    return [...known, ...extra].filter(cat => visibleEquipment.some(e => e.category === cat))
  }, [dbCategories, equipment, visibleEquipment])

  // Lege lijst (bv. net na de herstart): uitleg in plaats van een leeg raster.
  const noEquipment = equipmentLoaded && equipment.length === 0

  // ── Mobile: one day at a time ───────────────────────────────────────────────
  // The dates × equipment grid can't shrink to a phone, and scrolling it
  // sideways means hunting for the column you want. Below lg we show a single
  // day as a list of that day's reservations instead.
  const todayDate = today.getDate()
  const [mobileDay, setMobileDay] = useState(isCurrentMonth ? todayDate : 1)

  // Landing on a month always lands on today when it's the current one.
  useEffect(() => {
    setMobileDay(isCurrentMonth ? Math.min(todayDate, daysInMonth) : 1)
  }, [month, year, isCurrentMonth, daysInMonth, todayDate])

  // The strip holds a whole month, so the selected day is usually off-screen on
  // a phone. Without this you open the page on today but are looking at the 1st.
  const dayStripRef    = useRef<HTMLDivElement>(null)
  const selectedDayRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const strip = dayStripRef.current
    const btn   = selectedDayRef.current
    if (!strip || !btn) return
    strip.scrollLeft = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2
  }, [mobileDay, month, year])

  const mobileDate = toISO(new Date(year, month, mobileDay))

  // 'dag' lists that day's reservations; 'materiaal' is the equipment overview
  // itself, which the grid provided on desktop but the day list had no room for.
  const [mobileTab, setMobileTab] = useState<'dag' | 'materiaal'>('dag')

  // The grid only ever loads the visible month, but "last rented" and "next
  // out" routinely fall outside it. The whole table is a few hundred rows, so
  // it's cheaper to hold all of it than to query around each date.
  const [allReservations, setAllReservations] = useState<Reservation[]>([])
  useEffect(() => {
    fetch('/api/reservations?start=1970-01-01&end=2999-12-31')
      .then(r => r.ok ? r.json() : [])
      .then((rows: Reservation[]) => setAllReservations(Array.isArray(rows) ? rows : []))
      .catch(() => { /* history is a nicety; the planner works without it */ })
  }, [])

  // Namen om voor te reserveren of als verantwoordelijke te kiezen.
  const people = useMemo(() => {
    const names = new Set<string>(teamNames)
    for (const r of allReservations) names.add(r.reserved_by)
    if (currentUser) names.add(currentUser)
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [teamNames, allReservations, currentUser])
  const ownerOptions = useMemo(
    () => Array.from(new Set([...projects.map(p => p.name), ...people])),
    [projects, people]
  )

  // Per item: the most recent booking strictly before the selected day, and the
  // next one strictly after.
  const rentalHistory = useMemo(() => {
    const map = new Map<string, { last?: Reservation; next?: Reservation }>()
    for (const r of allReservations) {
      const entry = map.get(r.equipment_id) ?? {}
      if (r.date < mobileDate) {
        if (!entry.last || r.date > entry.last.date) entry.last = r
      } else if (r.date > mobileDate) {
        if (!entry.next || r.date < entry.next.date) entry.next = r
      }
      map.set(r.equipment_id, entry)
    }
    return map
  }, [allReservations, mobileDate])

  // Every reservation on the selected day, with its equipment resolved.
  const mobileReservations = useMemo(() => {
    return visibleEquipment
      .map(item => ({ item, res: resMap.get(`${item.id}_${mobileDate}`) }))
      .filter((x): x is { item: EquipmentItem; res: Reservation } => !!x.res)
      .sort((a, b) =>
        a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name))
  }, [visibleEquipment, resMap, mobileDate])

  return (
    <div className="flex flex-col h-full">
      {/* Header: titel en maand links, zoeken en reserveren rechts. Beheer,
          stats en externe huur zitten samen achter één menu — die gebruik je
          af en toe, reserveren elke dag. */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-5 min-w-0">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-zinc-100 truncate">Materiaalplanning</h1>
            <p className="lg:hidden text-xs sm:text-sm text-zinc-400 mt-0.5">{MONTH_NAMES[month]} {year}</p>
          </div>
          <div className="hidden lg:flex items-center gap-1">
            <button onClick={prevMonth} aria-label="Vorige maand" title="Vorige maand"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="w-36 text-center text-sm font-medium text-zinc-200 tabular-nums">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} aria-label="Volgende maand" title="Volgende maand"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
              <ChevronRight size={16} />
            </button>
            {!isCurrentMonth && (
              <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
                className="ml-1 px-2.5 py-1 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                Vandaag
              </button>
            )}
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          {!noEquipment && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Zoek materiaal of naam…"
                className="pl-7 pr-7 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors w-56"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Zoekopdracht wissen"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {canReserveren && !noEquipment && (
            <button
              onClick={() => setCreateModal({})}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white rounded-lg transition-colors hover:brightness-110"
              style={{ backgroundColor: '#3A913F' }}
            >
              <Plus size={13} /> Reserveren
            </button>
          )}

          {(canToevoegen || canStats || canExtern) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 rounded-lg transition-colors"
              >
                <Settings size={13} /> Meer <ChevronDown size={12} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-56 py-1 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl">
                    {canToevoegen && (
                      <>
                        <p className="px-3 pt-1.5 pb-1 text-[10px] text-zinc-600 uppercase tracking-wider">Inrichten</p>
                        {([
                          ['categorieen', 'Categorieën'],
                          ['materiaal',   'Materiaal & verantwoordelijken'],
                          ['defect',      'Defect melden'],
                          ['projecten',   'Vaste projecten'],
                        ] as [AdminTab, string][]).map(([tab, label]) => (
                          <button key={tab} role="menuitem"
                            onClick={() => { setMenuOpen(false); setAdminPanel({ tab }) }}
                            className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                            {label}
                          </button>
                        ))}
                      </>
                    )}
                    {(canStats || canExtern) && canToevoegen && <div className="my-1 border-t border-zinc-800" />}
                    {canStats && (
                      <Link href="/equipment/stats" role="menuitem"
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                        <BarChart3 size={13} className="text-zinc-500" /> Statistieken
                      </Link>
                    )}
                    {canExtern && (
                      <Link href="/equipment/extern" role="menuitem"
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                        <Calendar size={13} className="text-zinc-500" /> Externe huur
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {noEquipment ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center border border-zinc-800 bg-zinc-900">
              <Camera size={20} className="text-zinc-500" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Nog geen materiaal</h2>
            {canToevoegen ? (
              <>
                <p className="mt-1.5 text-sm text-zinc-500">
                  Zet eerst je categorieën klaar en voeg dan het materiaal toe — je kan een hele lijst in één keer plakken.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => setAdminPanel({ tab: 'materiaal' })}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg hover:brightness-110"
                    style={{ backgroundColor: '#3A913F' }}
                  >
                    <Plus size={14} /> Materiaal toevoegen
                  </button>
                  <button
                    onClick={() => setAdminPanel({ tab: 'categorieen' })}
                    className="px-4 py-2 text-sm text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800"
                  >
                    Categorieën bekijken
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-zinc-500">
                Zodra een beheerder het materiaal heeft ingegeven, kan je hier reserveren.
              </p>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* ── Mobile: one day, listed as reservations ── */}
      <div className="lg:hidden flex flex-col flex-1 min-h-0 px-4 pt-3 gap-3">
        {/* Month navigation — the desktop cluster is hidden on phones, so
            without this there is no way to leave the current month. */}
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <button onClick={prevMonth} aria-label="Vorige maand"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-zinc-200 truncate">{MONTH_NAMES[month]} {year}</span>
            {!isCurrentMonth && (
              <button
                onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setMobileDay(today.getDate()) }}
                className="px-2 py-1 text-[11px] text-zinc-400 border border-zinc-700 rounded-lg flex-shrink-0"
              >
                Vandaag
              </button>
            )}
          </div>
          <button onClick={nextMonth} aria-label="Volgende maand"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day strip — shared by both tabs: the selected day drives the
            reservation list and the status shown per item. */}
        <div ref={dayStripRef} className="scroll-x flex-shrink-0 -mx-1 px-1">
          <div className="flex gap-1.5">
            {days.map(d => {
              const dayNum = d.getDate()
              const iso    = toISO(d)
              const isSel  = dayNum === mobileDay
              const count  = visibleEquipment.filter(item => resMap.has(`${item.id}_${iso}`)).length
              return (
                <button
                  key={dayNum}
                  ref={isSel ? selectedDayRef : undefined}
                  onClick={() => setMobileDay(dayNum)}
                  className={`relative flex-shrink-0 w-11 py-1.5 rounded-lg border text-center transition-colors ${
                    isSel
                      ? 'bg-zinc-700 border-zinc-500 text-white'
                      : iso === todayISO
                        ? 'bg-[#111d11] border-[#3A913F]/50 text-zinc-300'
                        : isWeekend(d)
                          ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <span className="block text-[9px] uppercase tracking-wide opacity-70">{getDayName(d).slice(0, 2)}</span>
                  <span className="block text-sm font-semibold leading-tight">{dayNum}</span>
                  {count > 0 && !isSel && (
                    <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#3A913F] text-[9px] font-bold text-white flex items-center justify-center">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dag ↔ Materiaal */}
        <div className="flex p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 flex-shrink-0">
          {(['dag', 'materiaal'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mobileTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-400'
              }`}
            >
              {tab === 'dag' ? 'Dag' : 'Materiaal'}
            </button>
          ))}
        </div>

        {mobileTab === 'materiaal' ? (
          <>
            <div className="relative flex-shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Zoek materiaal…"
                className="w-full pl-9 pr-9 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Zoekopdracht wissen"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <X size={13} />
                </button>
              )}
            </div>

            {(canToevoegen || canStats) && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {canToevoegen && (
                  <button
                    onClick={() => setAdminPanel({ tab: 'materiaal' })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300"
                  >
                    <Plus size={13} /> Materiaal toevoegen
                  </button>
                )}
                {canToevoegen && (
                  <button
                    onClick={() => setAdminPanel({ tab: 'categorieen' })}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400"
                  >
                    <Settings size={13} /> Beheer
                  </button>
                )}
                {canStats && (
                  <Link href="/equipment/stats"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400"
                  >
                    <BarChart3 size={13} /> Stats
                  </Link>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pb-4 space-y-4">
              {categories.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-600">Geen materiaal gevonden.</div>
              ) : categories.map(cat => (
                <div key={cat}>
                  <p className="section-label mb-1.5" style={{ color: catColor(cat) }}>{cat}</p>
                  <div className="space-y-1.5">
                    {visibleEquipment.filter(e => e.category === cat).map(item => {
                      const res = resMap.get(`${item.id}_${mobileDate}`)
                      return (
                        <button
                          key={item.id}
                          onClick={() => res
                            ? setViewModal({ equipment: item, date: mobileDate, reservation: res })
                            : canReserveren && !item.is_broken
                              ? setCreateModal({ equipment: item, date: mobileDate })
                              : setInfoItem(item)}
                          className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 flex items-start gap-2.5"
                        >
                          <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: catColor(cat) }} />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm text-zinc-100 truncate">{item.name}</span>
                              {item.is_broken ? (
                                <span className="text-[11px] flex-shrink-0 px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>
                                  Defect
                                </span>
                              ) : res ? (
                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cellLabel(res).color }} />
                                  <span className="text-[11px] text-zinc-400">{cellLabel(res).text}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-600 flex-shrink-0">Vrij</span>
                              )}
                            </span>
                            {/* Where this item has been and where it's going —
                                the question you actually have when deciding
                                whether you can take it. */}
                            <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-600">
                              {(() => {
                                const h = rentalHistory.get(item.id)
                                const parts: string[] = []
                                if (h?.last) parts.push(`Laatst: ${getFirstName(h.last.reserved_by)} · ${shortDate(h.last.date)}`)
                                if (h?.next) parts.push(`Volgende: ${getFirstName(h.next.reserved_by)} · ${shortDate(h.next.date)}`)
                                return parts.length ? parts.join('   ') : 'Nog niet gereserveerd'
                              })()}
                            </span>
                            {item.owner && (
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-400/90">
                                <UserRound size={10} /> Verantwoordelijke · {item.owner}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
        <>

        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-zinc-200">
            {getDayName(new Date(year, month, mobileDay))} {mobileDay} {MONTH_NAMES[month]}
          </span>
          {canReserveren && (
            <button
              onClick={() => setCreateModal({ date: mobileDate })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-200"
            >
              <Plus size={13} /> Reserveren
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={22} className="animate-spin text-zinc-600" />
            </div>
          ) : mobileReservations.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">
              Niets gereserveerd op deze dag.
            </div>
          ) : (
            mobileReservations.map(({ item, res }) => (
              <button
                key={res.id}
                onClick={() => setViewModal({ equipment: item, date: mobileDate, reservation: res })}
                className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex items-start gap-3"
              >
                <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: catColor(item.category) }} />
                <div className="min-w-0 flex-1">
                  {/* Category names run long ("Ballieman + mobiele studio"), so
                      they sit under the name rather than competing with it. */}
                  <span className="block text-sm font-medium text-zinc-100 truncate">{item.name}</span>
                  <span className="block text-[10px] uppercase tracking-wide truncate" style={{ color: catColor(item.category) }}>
                    {item.category}
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cellLabel(res).color }} />
                    <span className="text-xs text-zinc-400 truncate">{cellLabel(res).text}</span>
                  </div>
                  {(res.pickup_datetime || res.return_datetime) && (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {formatDT(res.pickup_datetime)} → {formatDT(res.return_datetime)}
                    </p>
                  )}
                  {res.project && <p className="mt-0.5 text-[11px] text-zinc-500 truncate">{res.project}</p>}
                </div>
              </button>
            ))
          )}
        </div>
        </>
        )}
      </div>

      {/* Raster — enkel desktop */}
      <div className="hidden lg:block flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            Niets gevonden voor &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <EquipmentTimeline
            days={days}
            todayISO={todayISO}
            categories={categories}
            equipment={visibleEquipment}
            catColor={catColor}
            resMap={resMap}
            cellLabel={cellLabel}
            collapsed={collapsedCategories}
            onToggleCategory={toggleCategory}
            searching={!!searchQuery.trim()}
            dayProjects={dayProjects}
            onSaveDayProject={saveProjectName}
            canReserveren={canReserveren}
            canVerwijderen={canVerwijderen}
            onReserve={(item, date) => setCreateModal({ equipment: item, date })}
            onOpenReservation={(item, date, res) => setViewModal({ equipment: item, date, reservation: res })}
            onInfo={setInfoItem}
            onDelete={item => { setDeleteError(''); setDeleteConfirm(item) }}
          />
        )}
      </div>
      </>
      )}

      {/* Modals */}
      {viewModal && (
        <ReservationViewModal
          equipment={viewModal.equipment}
          date={viewModal.date}
          reservation={viewModal.reservation}
          currentUser={currentUser}
          isAdmin={isAdmin}
          canDeleteReservation={canReserveringVerwijderen}
          catColor={catColor}
          onClose={() => setViewModal(null)}
          onDeleted={(resId, equipId, pickupDt) => handleDeleted(resId, equipId, pickupDt)}
        />
      )}
      {adminPanel && (
        <EquipmentAdminPanel
          equipment={equipment}
          categories={dbCategories}
          projects={projects}
          people={ownerOptions}
          initialTab={adminPanel.tab}
          initialCategory={adminPanel.category}
          onClose={() => setAdminPanel(null)}
          onEquipmentChange={setEquipment}
          onCategoriesChange={setDbCategories}
          onProjectsChange={setProjects}
        />
      )}
      {createModal !== null && (
        <ReservationCreateModal
          equipment={equipment}
          resMap={resMap}
          allReservations={allReservations}
          projects={projects}
          people={people}
          currentUser={currentUser}
          catColor={catColor}
          initialEquipment={createModal.equipment}
          initialDate={createModal.date}
          onClose={() => setCreateModal(null)}
          onCreated={handleCreated}
        />
      )}
      {infoItem && (
        <EquipmentInfoModal item={infoItem} catColor={catColor} onClose={() => setInfoItem(null)} />
      )}
      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Materiaal verwijderen</h2>
            <button onClick={() => setDeleteConfirm(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-zinc-300">
              Ben je zeker dat je <span className="font-semibold text-zinc-100">{deleteConfirm.name}</span> wil verwijderen?
            </p>
            <p className="text-xs text-zinc-500 mt-1">Dit kan alleen als er geen reservaties meer op staan.</p>
            {deleteError && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
                <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-400">{deleteError}</p>
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Annuleren
            </button>
            <button
              onClick={() => handleEquipmentDelete(deleteConfirm)}
              disabled={deleting}
              className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
            >
              {deleting && <Loader2 size={13} className="animate-spin" />}
              Verwijderen
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
