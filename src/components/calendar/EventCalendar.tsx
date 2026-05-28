'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'dag' | 'week' | 'maand'

interface ProjectEvent {
  id: string
  title: string
  date: string
  end_date: string | null
  time: string | null
  client_id: string | null
  description: string | null
  type: string | null
  created_by: string | null
  created_at: string
}

interface ClientOption {
  id: string
  name: string
  color: string | null
  category: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { id: 'wedstrijd',  label: 'Wedstrijd / Match', color: '#22c55e' },
  { id: 'shoot',      label: 'Shoot / Opname',    color: '#3b82f6' },
  { id: 'deadline',   label: 'Deadline',           color: '#ef4444' },
  { id: 'evenement',  label: 'Evenement',          color: '#a855f7' },
  { id: 'vergadering',label: 'Vergadering',        color: '#f59e0b' },
  { id: 'overig',     label: 'Overig',             color: '#71717a' },
]

const DUTCH_MONTHS    = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']
const DUTCH_MONTHS_S  = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
const DUTCH_DAYS_FULL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
const WEEK_DAYS       = ['Ma','Di','Wo','Do','Vr','Za','Zo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(anchor: Date): Date[] {
  const mon = getWeekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d })
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month-1, 1)
  const last  = new Date(year, month, 0)
  const off   = first.getDay() === 0 ? 6 : first.getDay()-1
  const days: Array<{ date: Date; isCurrentMonth: boolean }> = []
  for (let i = off; i > 0; i--)  days.push({ date: new Date(year, month-1, 1-i),  isCurrentMonth: false })
  for (let d = 1; d <= last.getDate(); d++) days.push({ date: new Date(year, month-1, d), isCurrentMonth: true })
  const rem = 42 - days.length
  for (let d = 1; d <= rem; d++)  days.push({ date: new Date(year, month, d),      isCurrentMonth: false })
  return days
}

function getDateRange(anchor: Date, mode: ViewMode): { start: string; end: string } {
  if (mode === 'dag')  { const s = formatDate(anchor); return { start: s, end: s } }
  if (mode === 'week') { const w = getWeekDays(anchor); return { start: formatDate(w[0]), end: formatDate(w[6]) } }
  const y = anchor.getFullYear(), m = anchor.getMonth()+1
  return {
    start: `${y}-${String(m).padStart(2,'0')}-01`,
    end:   `${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`,
  }
}

function navigateAnchor(anchor: Date, mode: ViewMode, dir: 1|-1): Date {
  const d = new Date(anchor)
  if (mode === 'dag')   d.setDate(d.getDate() + dir)
  else if (mode === 'week')  d.setDate(d.getDate() + dir*7)
  else d.setMonth(d.getMonth() + dir)
  return d
}

function getNavLabel(anchor: Date, mode: ViewMode): string {
  if (mode === 'dag') {
    const dow = anchor.getDay()
    return `${DUTCH_DAYS_FULL[dow===0?6:dow-1]} ${anchor.getDate()} ${DUTCH_MONTHS[anchor.getMonth()].toLowerCase()} ${anchor.getFullYear()}`
  }
  if (mode === 'week') {
    const w = getWeekDays(anchor), s = w[0], e = w[6]
    if (s.getMonth()===e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${DUTCH_MONTHS[s.getMonth()].toLowerCase()} ${s.getFullYear()}`
    return `${s.getDate()} ${DUTCH_MONTHS_S[s.getMonth()]} – ${e.getDate()} ${DUTCH_MONTHS_S[e.getMonth()]} ${e.getFullYear()}`
  }
  return `${DUTCH_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
}

function eventColor(event: ProjectEvent, clients: ClientOption[]): string {
  if (event.client_id) {
    const client = clients.find(c => c.id === event.client_id)
    if (client?.color) return client.color
  }
  return EVENT_TYPES.find(t => t.id === event.type)?.color ?? '#71717a'
}

// ─── Event Modal ──────────────────────────────────────────────────────────────

function EventModal({ event, defaultDate, defaultClientId, clients, canDelete, onClose, onSave, onDelete }: {
  event: Partial<ProjectEvent> | null
  defaultDate: string | null
  defaultClientId?: string
  clients: ClientOption[]
  canDelete: boolean
  onClose: () => void
  onSave: (e: ProjectEvent) => void
  onDelete: (id: string) => void
}) {
  const isEditing = !!event?.id
  const [title,       setTitle]       = useState(event?.title       ?? '')
  const [date,        setDate]        = useState(event?.date        ?? defaultDate ?? '')
  const [endDate,     setEndDate]     = useState(event?.end_date    ?? '')
  const [time,        setTime]        = useState(event?.time        ?? '')
  const [clientId,    setClientId]    = useState(event?.client_id   ?? defaultClientId ?? '')
  const [type,        setType]        = useState(event?.type        ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const COLOR_PREVIEW = clientId
    ? (clients.find(c => c.id === clientId)?.color ?? EVENT_TYPES.find(t => t.id === type)?.color ?? '#71717a')
    : (EVENT_TYPES.find(t => t.id === type)?.color ?? '#71717a')

  async function handleSave() {
    if (!title.trim() || !date) return
    setSaving(true)
    const body = { title: title.trim(), date, end_date: endDate||null, time: time||null, client_id: clientId||null, description: description||null, type: type||null }
    try {
      if (isEditing) {
        const res = await fetch(`/api/events/${event!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        onSave(await res.json())
      } else {
        const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        onSave(await res.json())
      }
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!event?.id) return
    setDeleting(true)
    try { await fetch(`/api/events/${event.id}`, { method: 'DELETE' }); onDelete(event.id) }
    finally { setDeleting(false) }
  }

  // Group clients by category for optgroups
  const grouped: Record<string, ClientOption[]> = {}
  for (const c of clients) {
    if (!grouped[c.category]) grouped[c.category] = []
    grouped[c.category].push(c)
  }
  const catLabels: Record<string, string> = { intern: 'Intern', klant: 'Klanten', atleet: 'Atleten', podcast: 'Podcasts' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLOR_PREVIEW }} />
            <h3 className="text-sm font-semibold text-white">{isEditing ? 'Event bewerken' : 'Nieuw event'}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">

          {/* Titel */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Titel *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSave()}
              placeholder="bv. Bekerfinale Pro League" autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
          </div>

          {/* Datum + Tijdstip */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Datum *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]" />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Tijdstip</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]" />
            </div>
          </div>

          {/* Einddatum */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Einddatum <span className="normal-case font-normal">(optioneel, bij meerdaags event)</span></label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]" />
          </div>

          {/* Type */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-2 block font-medium uppercase tracking-wide">Type</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setType(type===t.id ? '' : t.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: type===t.id ? `${t.color}20` : 'rgba(39,39,42,0.8)',
                    border: type===t.id ? `1px solid ${t.color}50` : '1px solid rgba(63,63,70,0.5)',
                    color: type===t.id ? t.color : '#71717a',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Klant */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Klant / Atleet / Podcast</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]">
              <option value="">— Geen —</option>
              {Object.entries(catLabels).map(([cat, catLabel]) =>
                grouped[cat]?.length > 0 ? (
                  <optgroup key={cat} label={catLabel}>
                    {grouped[cat].map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ) : null
              )}
            </select>
          </div>

          {/* Omschrijving */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Omschrijving</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Extra context, locatie, notities…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 shrink-0">
          {isEditing && canDelete ? (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Zeker verwijderen?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : 'Ja, verwijder'}
                </button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Nee</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Verwijderen
              </button>
            )
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Annuleren</button>
            <button onClick={handleSave} disabled={!title.trim() || !date || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#3A913F] hover:bg-[#2d7a32] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors">
              {saving && <Loader2 size={12} className="animate-spin" />}
              {isEditing ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ anchor, events, clients, today, onDayClick, onEventClick }: {
  anchor: Date; events: ProjectEvent[]; clients: ClientOption[]; today: string
  onDayClick: (date: string) => void; onEventClick: (e: ProjectEvent) => void
}) {
  const days = getMonthDays(anchor.getFullYear(), anchor.getMonth()+1)

  function eventsForDate(date: Date): ProjectEvent[] {
    const s = formatDate(date)
    return events.filter(e => {
      if (e.date === s) return true
      if (e.end_date && e.date <= s && e.end_date >= s) return true
      return false
    })
  }

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 bg-zinc-900/80 border-b border-zinc-800">
        {WEEK_DAYS.map((d,i) => (
          <div key={d} className={`px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${i>=5?'text-zinc-600':'text-zinc-500'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(({ date, isCurrentMonth }, idx) => {
          const dateStr   = formatDate(date)
          const dayEvents = eventsForDate(date)
          const isToday   = dateStr === today
          const isWeekend = date.getDay()===0 || date.getDay()===6
          const isLastRow = idx >= 35
          return (
            <div key={idx} onClick={() => isCurrentMonth && onDayClick(dateStr)}
              className={`min-h-[110px] border-b border-r border-zinc-800/50 p-2 relative group transition-colors ${isLastRow?'border-b-0':''} ${isCurrentMonth ? isWeekend ? 'bg-zinc-900/20 hover:bg-zinc-900/50 cursor-pointer' : 'bg-transparent hover:bg-zinc-900/30 cursor-pointer' : 'bg-zinc-950/60 cursor-default'}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1.5 ${isToday?'bg-[#3A913F] text-white':isCurrentMonth?isWeekend?'text-zinc-600':'text-zinc-400':'text-zinc-700'}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0,3).map(ev => {
                  const color = eventColor(ev, clients)
                  const client = clients.find(c => c.id === ev.client_id)
                  return (
                    <button key={ev.id} onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                      className="w-full text-left px-1.5 py-[3px] rounded text-[10px] font-medium truncate leading-tight hover:opacity-75 transition-opacity"
                      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}35`, color }}>
                      {ev.time && <span className="opacity-60 mr-1">{ev.time.slice(0,5)}</span>}
                      {ev.title}
                      {client && <span className="opacity-50 ml-1">· {client.name}</span>}
                    </button>
                  )
                })}
                {dayEvents.length > 3 && <span className="text-[10px] text-zinc-600 px-1 mt-0.5">+{dayEvents.length-3} meer</span>}
              </div>
              {isCurrentMonth && (
                <button onClick={e => { e.stopPropagation(); onDayClick(dateStr) }}
                  className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-all">
                  <Plus size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ anchor, events, clients, today, onDayClick, onEventClick }: {
  anchor: Date; events: ProjectEvent[]; clients: ClientOption[]; today: string
  onDayClick: (date: string) => void; onEventClick: (e: ProjectEvent) => void
}) {
  const weekDays = getWeekDays(anchor)

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 bg-zinc-900/80 border-b border-zinc-800">
        {weekDays.map((day, i) => {
          const isToday = formatDate(day)===today
          return (
            <div key={i} className={`px-2 py-3 text-center border-r border-zinc-800 last:border-r-0 ${i>=5?'bg-zinc-900/30':''}`}>
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${i>=5?'text-zinc-600':'text-zinc-500'}`}>{WEEK_DAYS[i]}</div>
              <div className={`text-sm font-semibold mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isToday?'bg-[#3A913F] text-white':'text-zinc-400'}`}>{day.getDate()}</div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[480px]">
        {weekDays.map((day, i) => {
          const dateStr  = formatDate(day)
          const dayEvents = events.filter(e => {
            if (e.date === dateStr) return true
            if (e.end_date && e.date <= dateStr && e.end_date >= dateStr) return true
            return false
          }).sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99'))
          return (
            <div key={i} onClick={() => onDayClick(dateStr)}
              className={`border-r border-zinc-800/50 last:border-r-0 p-2 cursor-pointer group relative transition-colors ${i>=5?'bg-zinc-900/20 hover:bg-zinc-900/40':'hover:bg-zinc-900/20'}`}>
              <div className="flex flex-col gap-1.5">
                {dayEvents.map(ev => {
                  const color  = eventColor(ev, clients)
                  const type   = EVENT_TYPES.find(t => t.id === ev.type)
                  const client = clients.find(c => c.id === ev.client_id)
                  return (
                    <button key={ev.id} onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                      className="w-full text-left p-2 rounded-lg transition-opacity hover:opacity-80"
                      style={{ backgroundColor: `${color}12`, border: `1px solid ${color}30` }}>
                      {ev.time && <div className="text-[9px] text-zinc-500 mb-0.5">{ev.time.slice(0,5)}</div>}
                      <div className="text-[10px] font-semibold truncate" style={{ color }}>{ev.title}</div>
                      {client && <div className="text-[9px] text-zinc-600 truncate mt-0.5">{client.name}</div>}
                      {type && <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded-full inline-block" style={{ backgroundColor: `${type.color}20`, color: type.color }}>{type.label}</div>}
                    </button>
                  )
                })}
              </div>
              <button onClick={e => { e.stopPropagation(); onDayClick(dateStr) }}
                className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-all">
                <Plus size={10} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({ anchor, events, clients, canAdd, onAddClick, onEventClick }: {
  anchor: Date; events: ProjectEvent[]; clients: ClientOption[]; canAdd: boolean
  onAddClick: () => void; onEventClick: (e: ProjectEvent) => void
}) {
  const dateStr  = formatDate(anchor)
  const dayEvents = events
    .filter(e => e.date === dateStr || (e.end_date && e.date <= dateStr && e.end_date >= dateStr))
    .sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99'))

  if (dayEvents.length === 0) return (
    <div className="border border-zinc-800 rounded-xl p-12 text-center">
      <p className="text-sm text-zinc-600 mb-4">Geen events op deze dag</p>
      {canAdd && (
        <button onClick={onAddClick} className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors">
          <Plus size={12} /> Event toevoegen
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {dayEvents.map(ev => {
        const color  = eventColor(ev, clients)
        const type   = EVENT_TYPES.find(t => t.id === ev.type)
        const client = clients.find(c => c.id === ev.client_id)
        return (
          <button key={ev.id} onClick={() => onEventClick(ev)}
            className="w-full text-left border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors bg-zinc-900/20 hover:bg-zinc-900/40">
            <div className="flex items-start gap-3">
              <div className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-1.5">
                  {ev.time && <span className="text-xs font-medium text-zinc-400">{ev.time.slice(0,5)}</span>}
                  {ev.end_date && ev.end_date !== ev.date && (
                    <span className="text-xs text-zinc-500">t/m {DUTCH_MONTHS_S[new Date(ev.end_date).getMonth()]} {new Date(ev.end_date).getDate()}</span>
                  )}
                  {type && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor:`${type.color}20`, color: type.color }}>{type.label}</span>}
                  {client && <span className="text-xs text-zinc-500">{client.name}</span>}
                </div>
                <p className="text-sm font-semibold text-white mb-1">{ev.title}</p>
                {ev.description && <p className="text-xs text-zinc-500 leading-relaxed">{ev.description}</p>}
              </div>
            </div>
          </button>
        )
      })}
      {canAdd && (
        <button onClick={onAddClick} className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl text-xs text-zinc-500 hover:text-white transition-colors">
          <Plus size={12} /> Event toevoegen
        </button>
      )}
    </div>
  )
}

// ─── Upcoming sidebar ─────────────────────────────────────────────────────────

function UpcomingPanel({ events, clients, today, onEventClick }: {
  events: ProjectEvent[]; clients: ClientOption[]; today: string; onEventClick: (e: ProjectEvent) => void
}) {
  const upcoming = events
    .filter(e => e.date >= today)
    .slice(0, 6)

  if (upcoming.length === 0) return null

  return (
    <div className="border border-zinc-800 rounded-xl p-4">
      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Aankomend</p>
      <div className="flex flex-col gap-2">
        {upcoming.map(ev => {
          const color  = eventColor(ev, clients)
          const client = clients.find(c => c.id === ev.client_id)
          const d      = new Date(ev.date)
          return (
            <button key={ev.id} onClick={() => onEventClick(ev)}
              className="flex items-center gap-2.5 text-left hover:bg-zinc-800/40 rounded-lg p-1.5 -mx-1.5 transition-colors group">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-zinc-600 shrink-0 w-12">{d.getDate()} {DUTCH_MONTHS_S[d.getMonth()]}</span>
              <span className="text-xs text-zinc-400 truncate group-hover:text-zinc-200 transition-colors">{ev.title}</span>
              {client && <span className="text-[10px] text-zinc-600 shrink-0 hidden sm:block truncate max-w-[80px]">{client.name}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EventCalendar({ clientId: filterClientId, canAdd = true, canDelete = true }: { clientId?: string; canAdd?: boolean; canDelete?: boolean } = {}) {
  const now = new Date()
  const [viewMode, setViewMode] = useState<ViewMode>('maand')
  const [anchor,   setAnchor]   = useState(now)
  const [events,   setEvents]   = useState<ProjectEvent[]>([])
  const [clients,  setClients]  = useState<ClientOption[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState<{ event: Partial<ProjectEvent> | null; date: string | null } | null>(null)

  const today = formatDate(now)

  // Fetch clients once
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClients(data) })
      .catch(() => {})
  }, [])

  // Fetch events for current view range + upcoming (next 60 days always)
  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(anchor, viewMode)
      const upcomingEnd = new Date()
      upcomingEnd.setDate(upcomingEnd.getDate() + 60)
      const upcomingEndStr = formatDate(upcomingEnd)
      const extEnd   = end   > upcomingEndStr ? end   : upcomingEndStr
      const extStart = start < today          ? start : today

      const clientParam = filterClientId ? `&clientId=${filterClientId}` : ''
      const res  = await fetch(`/api/events?startDate=${extStart}&endDate=${extEnd}${clientParam}`)
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [anchor, viewMode, today, filterClientId])

  useEffect(() => { loadEvents() }, [loadEvents])

  function handleSave(saved: ProjectEvent) {
    setEvents(prev => {
      const exists = prev.find(e => e.id === saved.id)
      if (exists) return prev.map(e => e.id === saved.id ? saved : e)
      return [...prev, saved].sort((a,b) => a.date.localeCompare(b.date))
    })
    setModal(null)
  }

  function handleDelete(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id))
    setModal(null)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(prev => navigateAnchor(prev, viewMode, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[200px] text-center capitalize">
            {getNavLabel(anchor, viewMode)}
          </span>
          <button onClick={() => setAnchor(prev => navigateAnchor(prev, viewMode, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <ChevronRight size={15} />
          </button>
          {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
        </div>

        <div className="flex items-center gap-2">
          {canAdd && (
          <button onClick={() => setModal({ event: null, date: today })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3A913F] hover:bg-[#2d7a32] rounded-lg text-xs font-medium text-white transition-colors">
            <Plus size={12} /> Event toevoegen
          </button>
        )}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            {(['dag','week','maand'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${viewMode===mode?'bg-zinc-700 text-white shadow-sm':'text-zinc-500 hover:text-zinc-300'}`}>
                {mode.charAt(0).toUpperCase()+mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar + upcoming panel */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          {viewMode === 'maand' && <MonthView anchor={anchor} events={events} clients={clients} today={today} onDayClick={date => { if (canAdd) setModal({ event: null, date }) }} onEventClick={ev => setModal({ event: ev, date: ev.date })} />}
          {viewMode === 'week'  && <WeekView  anchor={anchor} events={events} clients={clients} today={today} onDayClick={date => { if (canAdd) setModal({ event: null, date }) }} onEventClick={ev => setModal({ event: ev, date: ev.date })} />}
          {viewMode === 'dag'   && <DayView   anchor={anchor} events={events} clients={clients} canAdd={canAdd} onAddClick={() => setModal({ event: null, date: formatDate(anchor) })} onEventClick={ev => setModal({ event: ev, date: ev.date })} />}
        </div>

        {/* Upcoming sidebar — only month/week view */}
        {viewMode !== 'dag' && (
          <div className="w-64 shrink-0 hidden lg:block">
            <UpcomingPanel events={events} clients={clients} today={today} onEventClick={ev => setModal({ event: ev, date: ev.date })} />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {EVENT_TYPES.map(t => (
          <div key={t.id} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="text-[10px] text-zinc-600">{t.label}</span>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal !== null && (
        <EventModal event={modal.event} defaultDate={modal.date} defaultClientId={filterClientId} clients={clients}
          canDelete={canDelete} onClose={() => setModal(null)} onSave={handleSave} onDelete={handleDelete} />
      )}
    </div>
  )
}
