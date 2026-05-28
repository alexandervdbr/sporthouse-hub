'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon,
  X, Loader2, AlertCircle, Trash2, BarChart3, Search, Info, Calendar
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EquipmentItem {
  id: string
  name: string
  category: string
  description?: string
}

interface Reservation {
  id: string
  equipment_id: string
  reserved_by: string
  date: string
  pickup_datetime: string | null
  return_datetime: string | null
  project: string | null
  note: string | null
}

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

const CATEGORY_COLORS: Record<string, string> = {
  'SET 1 VIDEO':               '#3A913F',
  'SET 2 VIDEO':               '#34a33a',
  'SET 3 VIDEO':               '#2eb535',
  'SET 4 VIDEO':               '#28c730',
  'SET 5 VIDEO':               '#22d92b',
  'FOTO':                      '#facc15',
  'EXTRA LENZEN':              '#0ea5e9',
  'Tentacle':                  '#a855f7',
  'Sennheiser':                '#c084fc',
  'LICHT':                     '#f59e0b',
  'GoPro':                     '#22d3ee',
  'Drone':                     '#38bdf8',
  'Statieven':                 '#64748b',
  'Extra':                     '#71717a',
  'Ballieman + mobiele studio':'#ec4899',
}

const CATEGORY_ORDER = [
  'SET 1 VIDEO', 'SET 2 VIDEO', 'SET 3 VIDEO', 'SET 4 VIDEO', 'SET 5 VIDEO',
  'FOTO', 'EXTRA LENZEN', 'Tentacle', 'Sennheiser', 'LICHT',
  'GoPro', 'Drone', 'Statieven', 'Extra', 'Ballieman + mobiele studio',
]

function catColor(cat: string) { return CATEGORY_COLORS[cat] ?? '#3A913F' }

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
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

// Build ISO datetime with local timezone offset (avoids UTC ambiguity)
function makeISO(date: string, time: string): string {
  const offset = -(new Date().getTimezoneOffset())
  const h = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')
  const m = (Math.abs(offset) % 60).toString().padStart(2, '0')
  const sign = offset >= 0 ? '+' : '-'
  return `${date}T${time}:00${sign}${h}:${m}`
}

const MONTH_NAMES = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]

// ─── Dimensions ──────────────────────────────────────────────────────────────

const DATE_COL_W    = 200
const EQUIP_COL_W   = 100
const COLLAPSED_W   = 36
const ROW_H         = 38
const HEADER_H      = 110
const ADMIN_EMAILS  = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

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

function EquipmentInfoModal({ item, onClose }: { item: EquipmentItem; onClose: () => void }) {
  const color = catColor(item.category)
  return (
    <Modal onClose={onClose}>
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color }}>{item.category}</p>
          <h2 className="text-sm font-semibold text-zinc-100">{item.name}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5 flex-shrink-0">
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4">
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

// ─── Add Equipment Modal ──────────────────────────────────────────────────────

function AddEquipmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (item: EquipmentItem) => void
}) {
  const [name,        setName]        = useState('')
  const [category,    setCategory]    = useState('')
  const [description, setDescription] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const allCategories = CATEGORY_ORDER

  async function handleSubmit() {
    if (!name.trim())     { setError('Geef een naam op.'); return }
    if (!category.trim()) { setError('Selecteer een categorie.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, description }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data || 'Onbekende fout')
      onCreated(data)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan')
    }
    setSaving(false)
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Materiaal toevoegen</h2>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Naam</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="bijv. Sony FX3"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Categorie</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors"
          >
            <option value="">Kies een categorie…</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
            Inhoud / omschrijving <span className="text-zinc-700 normal-case">(optioneel)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Inhoud van de set, specificaties…"
            rows={4}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Annuleren
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#3A913F' }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Toevoegen
        </button>
      </div>
    </Modal>
  )
}

// ─── Reservation Create Modal ─────────────────────────────────────────────────

interface CreateModalProps {
  equipment: EquipmentItem[]
  resMap: Map<string, Reservation>
  initialEquipment?: EquipmentItem
  initialDate?: string
  onClose: () => void
  onCreated: (reservations: Reservation[]) => void
}

function ReservationCreateModal({ equipment, resMap, initialEquipment, initialDate, onClose, onCreated }: CreateModalProps) {
  const today = toISO(new Date())

  const [query,       setQuery]       = useState('')
  const [selected,    setSelected]    = useState<EquipmentItem | null>(initialEquipment ?? null)
  const [pickupDate,  setPickupDate]  = useState(initialDate ?? today)
  const [pickupTime,  setPickupTime]  = useState('09:00')
  const [returnDate,  setReturnDate]  = useState(initialDate ?? today)
  const [returnTime,  setReturnTime]  = useState('17:00')
  const [project,     setProject]     = useState('')
  const [note,        setNote]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return equipment.filter(e => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)).slice(0, 8)
  }, [query, equipment])

  const occupiedDates = useMemo(
    () => getOccupiedDates(pickupDate, pickupTime, returnDate, returnTime),
    [pickupDate, pickupTime, returnDate, returnTime]
  )

  const conflicts = useMemo(
    () => selected ? occupiedDates.filter(d => resMap.has(`${selected.id}_${d}`)) : [],
    [selected, occupiedDates, resMap]
  )

  async function handleSubmit() {
    if (!selected) { setError('Selecteer eerst een materiaal.'); return }
    if (!pickupDate || !returnDate) { setError('Vul een datum in.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipment_id:     selected.id,
          pickup_datetime:  makeISO(pickupDate, pickupTime),
          return_datetime:  makeISO(returnDate, returnTime),
          project,
          note,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Onbekende fout')
      onCreated(Array.isArray(data) ? data : [data])
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan')
    }
    setSaving(false)
  }

  const color = selected ? catColor(selected.category) : '#3A913F'
  const canSubmit = !!selected && !!pickupDate && !!returnDate && occupiedDates.length > 0 && conflicts.length === 0

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Materiaal reserveren</h2>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

        {/* Equipment search */}
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Materiaal</label>
          {selected ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ background: `${color}15`, border: `1px solid ${color}35` }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{selected.name}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color }}>{selected.category}</p>
                </div>
              </div>
              <button onClick={() => { setSelected(null); setQuery('') }}
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-2 flex-shrink-0">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Zoek materiaal…"
                className="w-full pl-8 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              {filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden z-10 shadow-xl">
                  {filtered.map(item => {
                    const c = catColor(item.category)
                    return (
                      <button key={item.id} onClick={() => { setSelected(item); setQuery('') }}
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
          )}
          {/* Description */}
          {selected?.description && (
            <div className="mt-2 px-3 py-2 bg-zinc-800/60 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Inhoud set</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{selected.description}</p>
            </div>
          )}
        </div>

        {/* Datetime */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
              <span className="flex items-center gap-1"><Calendar size={11} /> Ophalen</span>
            </label>
            <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
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
                const isConflict = selected ? resMap.has(`${selected.id}_${d}`) : false
                const conflictRes = selected ? resMap.get(`${selected.id}_${d}`) : undefined
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
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Project</label>
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
        {(error || conflicts.length > 0) && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
            <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">
              {error || `Al gereserveerd op ${conflicts.length} ${conflicts.length === 1 ? 'dag' : 'dagen'} in deze maand.`}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Annuleren
        </button>
        <button onClick={handleSubmit} disabled={saving || !canSubmit}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: '#3A913F' }}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          Reserveren
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
  onClose: () => void
  onDeleted: (reservationId: string, equipmentId: string, pickupDatetime: string | null) => void
}

function ReservationViewModal({ equipment, reservation: res, currentUser, isAdmin, canDeleteReservation, onClose, onDeleted }: ViewModalProps) {
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
      await fetch(`/api/reservations/${res.id}`, { method: 'DELETE' })
      onDeleted(res.id, res.equipment_id, res.pickup_datetime)
      onClose()
    } catch {
      setError('Fout bij verwijderen')
    }
    setDeleting(false)
  }

  const canDelete = isAdmin || canDeleteReservation || res.reserved_by === currentUser

  return (
    <Modal onClose={onClose}>
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color }}>{equipment.category}</p>
          <h2 className="text-sm font-semibold text-zinc-100">{equipment.name}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5 flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Who */}
        <div className="flex items-center gap-3 py-3 px-4 rounded-xl"
          style={{ background: `${userColor}12`, border: `1px solid ${userColor}28` }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: userColor }} />
          <p className="text-sm font-medium text-zinc-200">{res.reserved_by}</p>
        </div>

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

      <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
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
  const [reservations,       setReservations]       = useState<Reservation[]>([])
  const [dayProjects,        setDayProjects]        = useState<Record<string, string>>({})
  const [loading,            setLoading]            = useState(true)
  const [currentUser,        setCurrentUser]        = useState('')
  const [isAdmin,            setIsAdmin]            = useState(false)
  const [collapsedCategories,setCollapsedCategories] = useState<Set<string>>(new Set())
  const [editingDay,         setEditingDay]         = useState<string | null>(null)
  const [editValue,          setEditValue]          = useState('')
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
  const [addEquipModal,  setAddEquipModal]  = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState<EquipmentItem | null>(null)
  const [deleting,       setDeleting]       = useState(false)

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
      const permsObj = meta.permissions ?? null
      const sections: string[] = permsObj?.sections ?? []
      const admin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
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

  // Load equipment once
  useEffect(() => {
    fetch('/api/equipment').then(r => r.json()).then(setEquipment).catch(console.error)
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
    setEditingDay(null)
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

  function handleCreated(newRes: Reservation[]) {
    setReservations(prev => [...prev, ...newRes])
  }

  function handleDeleted(reservationId: string, equipmentId: string, pickupDatetime: string | null) {
    setReservations(prev =>
      pickupDatetime
        ? prev.filter(r => !(r.equipment_id === equipmentId && r.pickup_datetime === pickupDatetime))
        : prev.filter(r => r.id !== reservationId)
    )
  }

  function handleEquipmentCreated(item: EquipmentItem) {
    setEquipment(prev => [...prev, item])
  }

  async function handleEquipmentDelete(item: EquipmentItem) {
    setDeleting(true)
    try {
      await fetch('/api/equipment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      setEquipment(prev => prev.filter(e => e.id !== item.id))
      setReservations(prev => prev.filter(r => r.equipment_id !== item.id))
    } catch (e) { console.error(e) }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  // Lookup map
  const resMap = useMemo(() => {
    const m = new Map<string, Reservation>()
    for (const r of reservations) m.set(`${r.equipment_id}_${r.date}`, r)
    return m
  }, [reservations])

  const visibleEquipment = useMemo(() => {
    if (!searchQuery.trim()) return equipment
    const q = searchQuery.toLowerCase()
    return equipment.filter(e =>
      e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    )
  }, [equipment, searchQuery])

  const categories = CATEGORY_ORDER.filter(cat => visibleEquipment.some(e => e.category === cat))

  const tableMinWidth = DATE_COL_W + categories.reduce((sum, cat) => {
    if (!searchQuery && collapsedCategories.has(cat)) return sum + COLLAPSED_W
    return sum + visibleEquipment.filter(e => e.category === cat).length * EQUIP_COL_W
  }, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Materiaalplanning</h1>
            <p className="text-sm text-zinc-400 mt-0.5">{MONTH_NAMES[month]} {year}</p>
          </div>
          {isAdmin && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              Beheerder
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Zoek materiaal…"
              className="pl-7 pr-7 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors w-44"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>

          {canToevoegen && (
            <button
              onClick={() => setAddEquipModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-100 rounded-lg transition-colors"
            >
              + Materiaal toevoegen
            </button>
          )}

          {canReserveren && (
            <button
              onClick={() => setCreateModal({})}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ backgroundColor: '#3A913F' }}
            >
              + Reserveren
            </button>
          )}

          <div className="w-px h-5 bg-zinc-800" />

          {!isCurrentMonth && (
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
              className="px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors">
              Deze maand
            </button>
          )}
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors">
            <ChevronRight size={15} />
          </button>
          <div className="w-px h-5 bg-zinc-800" />
          {canStats && (
            <Link href="/equipment/stats"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 rounded-lg transition-colors">
              <BarChart3 size={13} />
              Stats
            </Link>
          )}
          {canExtern && (
            <Link href="/equipment/extern"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 rounded-lg transition-colors">
              <Calendar size={13} />
              Extern
            </Link>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : (
          <table className="border-collapse" style={{ minWidth: tableMinWidth }}>
            <thead>
              {/* Category row */}
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-zinc-950 border-b border-r border-zinc-800 text-left"
                  style={{ width: DATE_COL_W, minWidth: DATE_COL_W, padding: '0 12px' }}
                  rowSpan={2}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest">Datum</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Project</span>
                  </div>
                </th>
                {categories.map(cat => {
                  const collapsed = !searchQuery && collapsedCategories.has(cat)
                  const count     = visibleEquipment.filter(e => e.category === cat).length
                  const color     = catColor(cat)
                  return (
                    <th key={cat}
                      colSpan={collapsed ? 1 : count}
                      onClick={() => toggleCategory(cat)}
                      className="sticky top-0 z-20 border-b border-r border-zinc-800 cursor-pointer select-none"
                      style={{
                        background: `linear-gradient(135deg, ${color}28 0%, #09090b 100%)`,
                        padding: collapsed ? '6px 4px' : '6px 10px',
                        width: collapsed ? COLLAPSED_W : undefined,
                        minWidth: collapsed ? COLLAPSED_W : undefined,
                        transition: 'all 0.15s',
                      }}>
                      {collapsed ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <ChevronRightIcon size={10} style={{ color }} />
                          <span className="text-[8px] font-bold uppercase" style={{ color, writingMode: 'vertical-rl', letterSpacing: 1 }}>
                            {cat.slice(0, 6)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color }}>
                            {cat}
                          </span>
                          <ChevronDown size={10} style={{ color, opacity: 0.6 }} />
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>

              {/* Equipment name row */}
              <tr>
                {categories.flatMap(cat => {
                  const collapsed = !searchQuery && collapsedCategories.has(cat)
                  if (collapsed) {
                    return [
                      <th key={`col-${cat}`}
                        className="sticky top-0 z-20 border-b border-r border-zinc-800/60 bg-zinc-950"
                        style={{ width: COLLAPSED_W, minWidth: COLLAPSED_W, height: HEADER_H }}
                      />
                    ]
                  }
                  const color = catColor(cat)
                  return visibleEquipment.filter(e => e.category === cat).map(item => (
                    <th key={item.id}
                      className="sticky top-0 z-20 border-b border-r border-zinc-800/60 bg-zinc-950 group/th"
                      style={{ width: EQUIP_COL_W, minWidth: EQUIP_COL_W, padding: '0 2px', height: HEADER_H }}>
                      <div className="flex items-start justify-center pt-2 px-1.5 relative cursor-pointer" style={{ height: HEADER_H }}
                        onClick={() => setInfoItem(item)}
                        title={`Klik voor inhoud: ${item.name}`}>
                        <Info size={9} className="absolute top-1.5 right-1.5 opacity-0 group-hover/th:opacity-60 transition-opacity" style={{ color }} />
                        <span className="text-[11px] font-medium leading-snug text-center transition-colors group-hover/th:opacity-80" style={{ color }}>
                          {item.name}
                        </span>
                        {canVerwijderen && (
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(item) }}
                            title="Materiaal verwijderen"
                            className="absolute bottom-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/th:opacity-100 transition-opacity p-0.5 rounded text-red-500 hover:text-red-400 hover:bg-red-950/40"
                          >
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))
                })}
              </tr>
            </thead>

            <tbody>
              {days.map(day => {
                const iso       = toISO(day)
                const isToday   = iso === todayISO
                const isPast    = iso < todayISO
                const weekend   = isWeekend(day)
                const dayName   = getDayName(day)
                const project   = dayProjects[iso] ?? ''
                const isEditing = editingDay === iso

                return (
                  <tr key={iso} className="group">
                    {/* Date + project cell */}
                    <td className="sticky left-0 z-10 border-b border-r border-zinc-800/60"
                      style={{
                        width: DATE_COL_W, minWidth: DATE_COL_W, height: ROW_H, padding: '0 10px',
                        background: isToday ? 'rgba(58,145,63,0.12)' : weekend ? '#0c0c0c' : '#09090b',
                      }}>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-sm font-semibold tabular-nums w-6 h-6 flex items-center justify-center rounded-full"
                            style={isToday
                              ? { backgroundColor: '#3A913F', color: '#fff' }
                              : { color: weekend ? '#71717a' : '#c4c4c1' }}>
                            {day.getDate()}
                          </span>
                          <span className={`text-[10px] uppercase tracking-wider ${weekend ? 'text-zinc-600' : 'text-zinc-500'}`}>
                            {dayName}
                          </span>
                          {!isPast && canReserveren && (
                            <button
                              onClick={() => setCreateModal({ date: iso })}
                              title="Materiaal reserveren voor deze dag"
                              className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all text-xs leading-none flex-shrink-0"
                            >
                              +
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <input autoFocus value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveProjectName(iso, editValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveProjectName(iso, editValue)
                              if (e.key === 'Escape') setEditingDay(null)
                            }}
                            className="w-24 px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                            placeholder="Project…"
                          />
                        ) : (
                          <span
                            className={`text-xs truncate cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 max-w-[90px] ${
                              project ? 'text-zinc-300 font-medium' : 'text-zinc-700 hover:text-zinc-500'
                            }`}
                            onClick={() => { setEditingDay(iso); setEditValue(project) }}
                            title={project || 'Klik om project toe te voegen'}>
                            {project || '+'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Equipment cells */}
                    {categories.flatMap(cat => {
                      const collapsed = !searchQuery && collapsedCategories.has(cat)
                      const catEquip  = visibleEquipment.filter(e => e.category === cat)

                      if (collapsed) {
                        const reservedCount = catEquip.filter(item => resMap.has(`${item.id}_${iso}`)).length
                        return [(
                          <td key={`c-${cat}-${iso}`}
                            onClick={() => toggleCategory(cat)}
                            className="border-b border-r border-zinc-800/40 cursor-pointer"
                            style={{ width: COLLAPSED_W, minWidth: COLLAPSED_W, height: ROW_H, padding: '3px' }}>
                            <div className="h-full rounded flex items-center justify-center"
                              style={{
                                backgroundColor: reservedCount > 0 ? `${catColor(cat)}18` : 'transparent',
                                border: reservedCount > 0 ? `1px solid ${catColor(cat)}35` : '1px solid transparent',
                              }}>
                              {reservedCount > 0 && (
                                <span className="text-[9px] font-bold" style={{ color: catColor(cat) }}>
                                  {reservedCount}
                                </span>
                              )}
                            </div>
                          </td>
                        )]
                      }

                      return catEquip.map(item => {
                        const res = resMap.get(`${item.id}_${iso}`)
                        if (res) {
                          const userColor = getUserColor(res.reserved_by)
                          return (
                            <td key={item.id}
                              className="border-b border-r border-zinc-800/40 cursor-pointer"
                              style={{ height: ROW_H, padding: '3px' }}
                              onClick={() => setViewModal({ equipment: item, date: iso, reservation: res })}
                              title={`${res.reserved_by}${res.project ? ` — ${res.project}` : ''}${res.note ? ` — ${res.note}` : ''}`}>
                              <div className="h-full rounded flex items-center justify-center px-1 overflow-hidden"
                                style={{ backgroundColor: `${userColor}22`, border: `1px solid ${userColor}55` }}>
                                <span className="text-[10px] font-semibold truncate leading-none" style={{ color: userColor }}>
                                  {getFirstName(res.reserved_by)}
                                </span>
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td key={item.id}
                            className={`border-b border-r border-zinc-800/40 ${!isPast ? 'cursor-pointer group/cell' : ''}`}
                            style={{ height: ROW_H, padding: '3px' }}
                            onClick={() => !isPast && setCreateModal({ equipment: item, date: iso })}>
                            <div className={`h-full rounded flex items-center justify-center transition-all ${
                              isPast ? 'opacity-20' : 'group-hover/cell:brightness-125'
                            }`}
                              style={{
                                backgroundColor: weekend && !isPast ? 'rgba(58,145,63,0.05)' : 'rgba(58,145,63,0.10)',
                                border: '1px solid rgba(58,145,63,0.18)',
                              }}>
                              {!isPast && <span className="text-[10px] font-medium text-[#3A913F]">Vrij</span>}
                            </div>
                          </td>
                        )
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {viewModal && (
        <ReservationViewModal
          equipment={viewModal.equipment}
          date={viewModal.date}
          reservation={viewModal.reservation}
          currentUser={currentUser}
          isAdmin={isAdmin}
          canDeleteReservation={canReserveringVerwijderen}
          onClose={() => setViewModal(null)}
          onDeleted={(resId, equipId, pickupDt) => handleDeleted(resId, equipId, pickupDt)}
        />
      )}
      {createModal !== null && (
        <ReservationCreateModal
          equipment={equipment}
          resMap={resMap}
          initialEquipment={createModal.equipment}
          initialDate={createModal.date}
          onClose={() => setCreateModal(null)}
          onCreated={handleCreated}
        />
      )}
      {infoItem && (
        <EquipmentInfoModal item={infoItem} onClose={() => setInfoItem(null)} />
      )}
      {addEquipModal && (
        <AddEquipmentModal
          onClose={() => setAddEquipModal(false)}
          onCreated={handleEquipmentCreated}
        />
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
            <p className="text-xs text-zinc-500 mt-1">Alle reservaties voor dit materiaal worden ook verwijderd.</p>
          </div>
          <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
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
