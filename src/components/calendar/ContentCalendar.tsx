'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'dag' | 'week' | 'maand' | 'jaar'

interface ContentPost {
  id: string
  client_id: string
  title: string
  copy: string | null
  platform: string | null
  status: string
  scheduled_date: string
  scheduled_time: string | null
  format: string | null
  creator: string | null
  collab: string | null
  link: string | null
  event_id: string | null
  created_by: string | null
  created_at: string
}

interface TeamMember { id: string; name: string; role: string | null }

interface ClientProjectEvent {
  id: string
  title: string
  date: string
  type: string | null
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'facebook',  label: 'FB', color: '#1877F2' },
  { id: 'instagram', label: 'IG', color: '#E1306C' },
  { id: 'twitter',   label: 'X',  color: '#1D9BF0' },
  { id: 'tiktok',    label: 'TT', color: '#69C9D0' },
  { id: 'youtube',   label: 'YT', color: '#FF4444' },
]

const STATUSES = [
  { id: 'to_shoot',     label: 'To shoot',     color: '#f59e0b' },
  { id: 'in_productie', label: 'In productie', color: '#3b82f6' },
  { id: 'afgewerkt',    label: 'Afgewerkt',    color: '#22c55e' },
]

const FORMATS = ['Fotoslider', 'Reel', 'Visual']

const EVENT_TYPE_COLORS: Record<string, string> = {
  wedstrijd:   '#22c55e',
  shoot:       '#3b82f6',
  deadline:    '#ef4444',
  evenement:   '#a855f7',
  vergadering: '#f59e0b',
  overig:      '#71717a',
}

const DUTCH_MONTHS = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
]
const DUTCH_DAYS_FULL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
const WEEK_DAYS = ['Ma','Di','Wo','Do','Vr','Za','Zo']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parsePlatforms(raw: string | null): string[] {
  return raw ? raw.split(',').filter(Boolean) : []
}

function parseCreators(raw: string | null): string[] {
  return raw ? raw.split(',').filter(Boolean) : []
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(anchor: Date): Date[] {
  const monday = getWeekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0)
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const days: Array<{ date: Date; isCurrentMonth: boolean }> = []
  for (let i = startOffset; i > 0; i--)
    days.push({ date: new Date(year, month - 1, 1 - i), isCurrentMonth: false })
  for (let d = 1; d <= lastDay.getDate(); d++)
    days.push({ date: new Date(year, month - 1, d), isCurrentMonth: true })
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++)
    days.push({ date: new Date(year, month, d), isCurrentMonth: false })
  return days
}

function getDateRange(anchor: Date, mode: ViewMode): { start: string; end: string } {
  if (mode === 'dag') { const s = formatDate(anchor); return { start: s, end: s } }
  if (mode === 'week') {
    const days = getWeekDays(anchor)
    return { start: formatDate(days[0]), end: formatDate(days[6]) }
  }
  if (mode === 'maand') {
    const y = anchor.getFullYear(), m = anchor.getMonth() + 1
    const last = new Date(y, m, 0).getDate()
    return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
  }
  return { start: `${anchor.getFullYear()}-01-01`, end: `${anchor.getFullYear()}-12-31` }
}

function navigateAnchor(anchor: Date, mode: ViewMode, dir: 1 | -1): Date {
  const d = new Date(anchor)
  if (mode === 'dag')        d.setDate(d.getDate() + dir)
  else if (mode === 'week')  d.setDate(d.getDate() + dir * 7)
  else if (mode === 'maand') d.setMonth(d.getMonth() + dir)
  else                       d.setFullYear(d.getFullYear() + dir)
  return d
}

function getNavLabel(anchor: Date, mode: ViewMode): string {
  if (mode === 'dag') {
    const dow  = anchor.getDay()
    const name = DUTCH_DAYS_FULL[dow === 0 ? 6 : dow - 1]
    return `${name} ${anchor.getDate()} ${DUTCH_MONTHS[anchor.getMonth()].toLowerCase()} ${anchor.getFullYear()}`
  }
  if (mode === 'week') {
    const days = getWeekDays(anchor)
    const s = days[0], e = days[6]
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${DUTCH_MONTHS[s.getMonth()].toLowerCase()} ${s.getFullYear()}`
    return `${s.getDate()} ${DUTCH_MONTHS[s.getMonth()].toLowerCase()} – ${e.getDate()} ${DUTCH_MONTHS[e.getMonth()].toLowerCase()} ${e.getFullYear()}`
  }
  if (mode === 'maand') return `${DUTCH_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
  return String(anchor.getFullYear())
}

function postColor(post: ContentPost): string {
  const firstPlatform = parsePlatforms(post.platform)[0]
  const plt = PLATFORMS.find(p => p.id === firstPlatform)
  const sts = STATUSES.find(s => s.id === post.status)
  return plt?.color ?? sts?.color ?? '#71717a'
}

// ─── Multi-select pill ────────────────────────────────────────────────────────

function MultiPill({ label, color, selected, onClick }: { label: string; color: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        backgroundColor: selected ? `${color}20` : 'rgba(39,39,42,0.8)',
        border: selected ? `1px solid ${color}50` : '1px solid rgba(63,63,70,0.5)',
        color: selected ? color : '#71717a',
      }}>
      {label}
    </button>
  )
}

// ─── Post Modal ───────────────────────────────────────────────────────────────

interface PostModalProps {
  post: Partial<ContentPost> | null
  defaultDate: string | null
  clientId: string
  teamMembers: TeamMember[]
  projectEvents: ClientProjectEvent[]
  canDelete: boolean
  onClose: () => void
  onSave: (post: ContentPost) => void
  onDelete: (id: string) => void
}

function PostModal({ post, defaultDate, clientId, teamMembers, projectEvents, canDelete, onClose, onSave, onDelete }: PostModalProps) {
  const isEditing = !!post?.id

  const [title,      setTitle]      = useState(post?.title          ?? '')
  const [date,       setDate]       = useState(post?.scheduled_date ?? defaultDate ?? '')
  const [time,       setTime]       = useState(post?.scheduled_time ?? '')
  const [platforms,  setPlatforms]  = useState<string[]>(parsePlatforms(post?.platform ?? null))
  const [format,     setFormat]     = useState(post?.format   ?? '')
  const [creators,   setCreators]   = useState<string[]>(parseCreators(post?.creator ?? null))
  const [status,     setStatus]     = useState(post?.status   ?? 'to_shoot')
  const [collab,     setCollab]     = useState(post?.collab   ?? '')
  const [link,       setLink]       = useState(post?.link     ?? '')
  const [caption,    setCaption]    = useState(post?.copy     ?? '')
  const [eventId,    setEventId]    = useState(post?.event_id ?? '')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  function togglePlatform(id: string) {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function toggleCreator(name: string) {
    setCreators(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name])
  }

  async function handleSave() {
    if (!title.trim() || !date) return
    setSaving(true)
    const body = {
      title:          title.trim(),
      copy:           caption   || null,
      platform:       platforms.join(',') || null,
      creator:        creators.join(',')  || null,
      status,
      scheduled_date: date,
      scheduled_time: time     || null,
      format:         format   || null,
      collab:         collab   || null,
      link:           link     || null,
      event_id:       eventId  || null,
    }
    try {
      if (isEditing) {
        const res = await fetch(`/api/calendar/${post!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        onSave(await res.json())
      } else {
        const res = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, ...body }) })
        onSave(await res.json())
      }
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!post?.id) return
    setDeleting(true)
    try { await fetch(`/api/calendar/${post.id}`, { method: 'DELETE' }); onDelete(post.id) }
    finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-semibold text-white">{isEditing ? 'Post bewerken' : 'Nieuwe post'}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">

          {/* Korte omschrijving */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Korte omschrijving *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="bv. Man of the Match — Speeldag 34" autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
          </div>

          {/* Datum + Online */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Datum *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]" />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Online (tijdstip)</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]" />
            </div>
          </div>

          {/* Platform — multi-select */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Platform</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <MultiPill key={p.id} label={p.label} color={p.color} selected={platforms.includes(p.id)} onClick={() => togglePlatform(p.id)} />
              ))}
            </div>
          </div>

          {/* Format — single-select pills */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => (
                <button key={f} type="button" onClick={() => setFormat(format === f ? '' : f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: format === f ? 'rgba(58,145,63,0.15)' : 'rgba(39,39,42,0.8)',
                    border: format === f ? '1px solid rgba(58,145,63,0.4)' : '1px solid rgba(63,63,70,0.5)',
                    color: format === f ? '#3A913F' : '#71717a',
                  }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Creator — multi-select from team */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Creator</label>
            {teamMembers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {teamMembers.map(m => (
                  <button key={m.id} type="button" onClick={() => toggleCreator(m.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: creators.includes(m.name) ? 'rgba(168,85,247,0.15)' : 'rgba(39,39,42,0.8)',
                      border: creators.includes(m.name) ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(63,63,70,0.5)',
                      color: creators.includes(m.name) ? '#a855f7' : '#71717a',
                    }}>
                    {m.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Geen teamleden gevonden</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button key={s.id} type="button" onClick={() => setStatus(s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: status === s.id ? `${s.color}20` : 'rgba(39,39,42,0.8)',
                    border: status === s.id ? `1px solid ${s.color}50` : '1px solid rgba(63,63,70,0.5)',
                    color: status === s.id ? s.color : '#71717a',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Collab */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Collab</label>
            <input type="text" value={collab} onChange={e => setCollab(e.target.value)} placeholder="bv. @partner_account"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
          </div>

          {/* Link */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Link</label>
            <input type="text" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors" />
          </div>

          {/* Gekoppeld project */}
          {projectEvents.length > 0 && (
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Gekoppeld project</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]">
                <option value="">— Geen —</option>
                {projectEvents.map(ev => {
                  const d = new Date(ev.date)
                  const label = `${d.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]} — ${ev.title}`
                  return <option key={ev.id} value={ev.id}>{label}</option>
                })}
              </select>
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block font-medium uppercase tracking-wide">Caption</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
              placeholder="De volledige caption voor deze post…"
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

function MonthView({ anchor, posts, today, onDayClick, onPostClick }: {
  anchor: Date; posts: ContentPost[]; today: string
  onDayClick: (date: string) => void; onPostClick: (p: ContentPost) => void
}) {
  const days = getMonthDays(anchor.getFullYear(), anchor.getMonth() + 1)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 bg-zinc-900/80 border-b border-zinc-800">
        {WEEK_DAYS.map((day, i) => (
          <div key={day} className={`px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${i >= 5 ? 'text-zinc-600' : 'text-zinc-500'}`}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(({ date, isCurrentMonth }, idx) => {
          const dateStr   = formatDate(date)
          const dayPosts  = posts.filter(p => p.scheduled_date === dateStr)
          const isToday   = dateStr === today
          const isWeekend = date.getDay() === 0 || date.getDay() === 6
          const isLastRow = idx >= 35
          return (
            <div key={idx} onClick={() => isCurrentMonth && onDayClick(dateStr)}
              className={`min-h-[108px] border-b border-r border-zinc-800/50 p-2 relative group transition-colors ${isLastRow ? 'border-b-0' : ''} ${isCurrentMonth ? isWeekend ? 'bg-zinc-900/20 hover:bg-zinc-900/50 cursor-pointer' : 'bg-transparent hover:bg-zinc-900/30 cursor-pointer' : 'bg-zinc-950/60 cursor-default'}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1.5 ${isToday ? 'bg-[#3A913F] text-white' : isCurrentMonth ? isWeekend ? 'text-zinc-600' : 'text-zinc-400' : 'text-zinc-700'}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayPosts.slice(0, 3).map(post => {
                  const color = postColor(post)
                  const plts  = parsePlatforms(post.platform)
                  return (
                    <button key={post.id} onClick={e => { e.stopPropagation(); onPostClick(post) }}
                      className="w-full text-left px-1.5 py-[3px] rounded text-[10px] font-medium truncate leading-tight hover:opacity-75 transition-opacity"
                      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}35`, color }}>
                      {post.scheduled_time && <span className="opacity-60 mr-1">{post.scheduled_time.slice(0, 5)}</span>}
                      {plts.length > 0 && <span className="mr-1 opacity-80">{PLATFORMS.find(p => p.id === plts[0])?.label}</span>}
                      {post.title}
                    </button>
                  )
                })}
                {dayPosts.length > 3 && <span className="text-[10px] text-zinc-600 px-1 mt-0.5">+{dayPosts.length - 3} meer</span>}
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

function WeekView({ anchor, posts, today, onDayClick, onPostClick }: {
  anchor: Date; posts: ContentPost[]; today: string
  onDayClick: (date: string) => void; onPostClick: (p: ContentPost) => void
}) {
  const weekDays = getWeekDays(anchor)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 bg-zinc-900/80 border-b border-zinc-800">
        {weekDays.map((day, i) => {
          const isToday = formatDate(day) === today
          return (
            <div key={i} className={`px-2 py-3 text-center border-r border-zinc-800 last:border-r-0 ${i >= 5 ? 'bg-zinc-900/30' : ''}`}>
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${i >= 5 ? 'text-zinc-600' : 'text-zinc-500'}`}>{WEEK_DAYS[i]}</div>
              <div className={`text-sm font-semibold mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-[#3A913F] text-white' : 'text-zinc-400'}`}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[480px]">
        {weekDays.map((day, i) => {
          const dateStr  = formatDate(day)
          const dayPosts = posts.filter(p => p.scheduled_date === dateStr)
            .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'))
          return (
            <div key={i} onClick={() => onDayClick(dateStr)}
              className={`border-r border-zinc-800/50 last:border-r-0 p-2 cursor-pointer group relative transition-colors ${i >= 5 ? 'bg-zinc-900/20 hover:bg-zinc-900/40' : 'hover:bg-zinc-900/20'}`}>
              <div className="flex flex-col gap-1.5">
                {dayPosts.map(post => {
                  const color = postColor(post)
                  const sts   = STATUSES.find(s => s.id === post.status)
                  const plts  = parsePlatforms(post.platform)
                  return (
                    <button key={post.id} onClick={e => { e.stopPropagation(); onPostClick(post) }}
                      className="w-full text-left p-2 rounded-lg transition-opacity hover:opacity-80"
                      style={{ backgroundColor: `${color}12`, border: `1px solid ${color}30` }}>
                      {post.scheduled_time && <div className="text-[9px] text-zinc-500 mb-0.5">{post.scheduled_time.slice(0, 5)}</div>}
                      {plts.length > 0 && (
                        <div className="flex gap-1 mb-0.5">
                          {plts.map(pid => {
                            const p = PLATFORMS.find(pl => pl.id === pid)
                            return p ? <span key={pid} className="text-[9px] font-bold" style={{ color: p.color }}>{p.label}</span> : null
                          })}
                        </div>
                      )}
                      <div className="text-[10px] font-semibold truncate leading-snug" style={{ color }}>{post.title}</div>
                      {post.format && <div className="text-[9px] text-zinc-600 truncate mt-0.5">{post.format}</div>}
                      {sts && <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded-full inline-block" style={{ backgroundColor: `${sts.color}20`, color: sts.color }}>{sts.label}</div>}
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

function DayView({ anchor, posts, canAdd, onAddClick, onPostClick }: {
  anchor: Date; posts: ContentPost[]; canAdd: boolean
  onAddClick: () => void; onPostClick: (p: ContentPost) => void
}) {
  const dateStr  = formatDate(anchor)
  const dayPosts = posts.filter(p => p.scheduled_date === dateStr)
    .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'))

  if (dayPosts.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-xl p-12 text-center">
        <p className="text-sm text-zinc-600 mb-4">Geen posts gepland op deze dag</p>
        {canAdd && (
          <button onClick={onAddClick} className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors">
            <Plus size={12} /> Post toevoegen
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {dayPosts.map(post => {
        const color = postColor(post)
        const sts   = STATUSES.find(s => s.id === post.status)
        const plts  = parsePlatforms(post.platform).map(id => PLATFORMS.find(p => p.id === id)).filter(Boolean)
        const crts  = parseCreators(post.creator)
        return (
          <button key={post.id} onClick={() => onPostClick(post)}
            className="w-full text-left border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors bg-zinc-900/20 hover:bg-zinc-900/40">
            <div className="flex items-start gap-3">
              <div className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-1.5">
                  {post.scheduled_time && <span className="text-xs font-medium text-zinc-400">{post.scheduled_time.slice(0, 5)}</span>}
                  {plts.map(p => p && <span key={p.id} className="text-xs font-bold" style={{ color: p.color }}>{p.label}</span>)}
                  {post.format && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{post.format}</span>}
                  {sts && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${sts.color}20`, color: sts.color }}>{sts.label}</span>}
                </div>
                <p className="text-sm font-semibold text-white mb-2">{post.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {crts.length > 0 && <span className="text-xs text-zinc-500">Creator: <span className="text-zinc-400">{crts.join(', ')}</span></span>}
                  {post.collab && <span className="text-xs text-zinc-500">Collab: <span className="text-zinc-400">{post.collab}</span></span>}
                  {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-400 hover:text-blue-300 underline truncate max-w-[200px]">{post.link}</a>}
                </div>
                {post.copy && <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{post.copy}</p>}
              </div>
            </div>
          </button>
        )
      })}
      {canAdd && (
        <button onClick={onAddClick} className="self-start inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl text-xs text-zinc-500 hover:text-white transition-colors">
          <Plus size={12} /> Post toevoegen
        </button>
      )}
    </div>
  )
}

// ─── Year View ────────────────────────────────────────────────────────────────

function YearView({ anchor, posts, onMonthClick, onDayClick }: {
  anchor: Date; posts: ContentPost[]
  onMonthClick: (month: number) => void; onDayClick: (date: string) => void
}) {
  const year = anchor.getFullYear()
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const monthPosts  = posts.filter(p => { const d = new Date(p.scheduled_date); return d.getFullYear() === year && d.getMonth() === m })
        const days        = getMonthDays(year, m + 1)
        const statusCounts = STATUSES.map(s => ({ ...s, count: monthPosts.filter(p => p.status === s.id).length })).filter(s => s.count > 0)
        return (
          <div key={m} onClick={() => onMonthClick(m)} className="border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-colors cursor-pointer group">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors">{DUTCH_MONTHS[m]}</span>
              {monthPosts.length > 0 && <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{monthPosts.length}</span>}
            </div>
            <div className="grid grid-cols-7 gap-[2px] mb-2">
              {['M','D','W','D','V','Z','Z'].map((d, i) => (
                <div key={i} className="text-[7px] text-zinc-700 text-center leading-none pb-[2px]">{d}</div>
              ))}
              {days.map(({ date, isCurrentMonth }, idx) => {
                if (!isCurrentMonth) return <div key={idx} className="aspect-square" />
                const dateStr = formatDate(date)
                const dp      = posts.filter(p => p.scheduled_date === dateStr)
                const color   = dp.length > 0 ? postColor(dp[0]) : null
                return (
                  <div key={idx} onClick={e => { if (dp.length > 0) { e.stopPropagation(); onDayClick(dateStr) } }}
                    className="aspect-square rounded-[2px] transition-opacity hover:opacity-80"
                    style={{ backgroundColor: color ? `${color}30` : 'rgba(39,39,42,0.4)', border: `1px solid ${color ? `${color}50` : 'transparent'}` }}
                    title={dp.length > 0 ? `${dp.length} post${dp.length > 1 ? 's' : ''}` : undefined} />
                )
              })}
            </div>
            {statusCounts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {statusCounts.map(s => (
                  <div key={s.id} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[9px] text-zinc-600">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContentCalendar({ clientId, canAdd = true, canDelete = true }: { clientId: string; canAdd?: boolean; canDelete?: boolean }) {
  const now = new Date()
  const [viewMode,      setViewMode]      = useState<ViewMode>('maand')
  const [anchor,        setAnchor]        = useState(now)
  const [posts,         setPosts]         = useState<ContentPost[]>([])
  const [teamMembers,   setTeamMembers]   = useState<TeamMember[]>([])
  const [projectEvents, setProjectEvents] = useState<ClientProjectEvent[]>([])
  const [filterEventId, setFilterEventId] = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [modal,         setModal]         = useState<{ post: Partial<ContentPost> | null; date: string | null } | null>(null)

  const today = formatDate(now)

  // Fetch team members + project events once
  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setTeamMembers(data) })
      .catch(() => {})

    fetch(`/api/events?clientId=${clientId}`)
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setProjectEvents(data) })
      .catch(() => {})
  }, [clientId])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(anchor, viewMode)
      const eventParam = filterEventId ? `&eventId=${filterEventId}` : ''
      const res  = await fetch(`/api/calendar?clientId=${clientId}&startDate=${start}&endDate=${end}${eventParam}`)
      const data = await res.json()
      setPosts(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [clientId, anchor, viewMode, filterEventId])

  useEffect(() => { loadPosts() }, [loadPosts])

  function navigate(dir: 1 | -1) { setAnchor(prev => navigateAnchor(prev, viewMode, dir)) }

  function handleSave(saved: ContentPost) {
    setPosts(prev => {
      const exists = prev.find(p => p.id === saved.id)
      if (exists) return prev.map(p => p.id === saved.id ? saved : p)
      return [...prev, saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    })
    setModal(null)
  }

  function handleDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setModal(null)
  }

  const statusSummary = viewMode !== 'jaar'
    ? STATUSES.map(s => ({ ...s, count: posts.filter(p => p.status === s.id).length })).filter(s => s.count > 0)
    : []

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-white min-w-[210px] text-center capitalize">
            {getNavLabel(anchor, viewMode)}
          </span>
          <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <ChevronRight size={15} />
          </button>
          {loading && <Loader2 size={13} className="animate-spin text-zinc-600" />}
        </div>

        <div className="flex items-center gap-3">
          {statusSummary.length > 0 && (
            <div className="hidden sm:flex items-center gap-3">
              {statusSummary.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-zinc-500">{s.label} <span className="text-zinc-600">({s.count})</span></span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            {(['dag', 'week', 'maand', 'jaar'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${viewMode === mode ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main area: sidebar + calendar */}
      <div className="flex gap-4 items-start">

        {/* Project sidebar */}
        {projectEvents.length > 0 && (
          <div className="w-48 shrink-0 flex flex-col gap-1 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Projecten</p>
            </div>

            {/* Alle posts */}
            <button
              onClick={() => setFilterEventId(null)}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors relative ${
                filterEventId === null ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'
              }`}
            >
              {filterEventId === null && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-zinc-400" />
              )}
              <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
              <div className="min-w-0">
                <p className={`text-xs font-medium truncate ${filterEventId === null ? 'text-white' : 'text-zinc-400'}`}>
                  Alle posts
                </p>
                <p className="text-[10px] text-zinc-600">{posts.length} posts</p>
              </div>
            </button>

            {/* Per project */}
            {projectEvents.map(ev => {
              const active    = filterEventId === ev.id
              const color     = EVENT_TYPE_COLORS[ev.type ?? ''] ?? '#71717a'
              const d         = new Date(ev.date)
              const months    = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
              const postCount = posts.filter(p => p.event_id === ev.id).length
              return (
                <button
                  key={ev.id}
                  onClick={() => setFilterEventId(active ? null : ev.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors relative border-t border-zinc-800/60 ${
                    active ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full" style={{ backgroundColor: color }} />
                  )}
                  <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate leading-snug ${active ? 'text-white' : 'text-zinc-400'}`}>
                      {ev.title}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {d.getDate()} {months[d.getMonth()]} · {postCount} {postCount === 1 ? 'post' : 'posts'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Calendar views */}
        <div className="flex-1 min-w-0">
          {viewMode === 'maand' && <MonthView anchor={anchor} posts={posts} today={today} onDayClick={date => { if (canAdd) setModal({ post: null, date }) }} onPostClick={post => setModal({ post, date: post.scheduled_date })} />}
          {viewMode === 'week'  && <WeekView  anchor={anchor} posts={posts} today={today} onDayClick={date => { if (canAdd) setModal({ post: null, date }) }} onPostClick={post => setModal({ post, date: post.scheduled_date })} />}
          {viewMode === 'dag'   && <DayView   anchor={anchor} posts={posts} canAdd={canAdd} onAddClick={() => setModal({ post: null, date: formatDate(anchor) })} onPostClick={post => setModal({ post, date: post.scheduled_date })} />}
          {viewMode === 'jaar'  && <YearView  anchor={anchor} posts={posts} onMonthClick={m => { setAnchor(new Date(anchor.getFullYear(), m, 1)); setViewMode('maand') }} onDayClick={date => { setAnchor(new Date(date)); setViewMode('dag') }} />}
        </div>
      </div>

      {viewMode !== 'jaar' && (
        <div className="flex items-center gap-4 flex-wrap">
          {PLATFORMS.map(p => (
            <div key={p.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-[10px] text-zinc-600">{p.label}</span>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <PostModal post={modal.post} defaultDate={modal.date} clientId={clientId} teamMembers={teamMembers} projectEvents={projectEvents}
          canDelete={canDelete} onClose={() => setModal(null)} onSave={handleSave} onDelete={handleDelete} />
      )}
    </div>
  )
}
