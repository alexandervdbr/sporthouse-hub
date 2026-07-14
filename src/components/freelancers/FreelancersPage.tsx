'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Loader2, X, Star, Sparkles, Download,
  Phone, Mail, AlertCircle, Check, ExternalLink, Globe,
  FileText, Video, Camera, Palette, BookOpen, Clapperboard,
  Users, Layers, Wand2, PenTool, MonitorPlay, Zap, Mic, Pencil, ImagePlus,
} from 'lucide-react'
import { DriveThumbnail } from '@/components/shared/DrivePreview'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPES = [
  'Story', 'Video', 'Foto/Video', 'Visuals', 'Foto', 'Redacteur',
  'Social Host', 'Allround', 'Video (vfx/motion)', 'Grafisch Design',
  'Online Editor', 'VFX Generalist', 'Podcasting',
] as const
type FreelancerType = typeof TYPES[number]

const TYPE_STYLES: Record<FreelancerType, { bg: string; text: string; border: string }> = {
  'Story':             { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)'  },
  'Video':             { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)'  },
  'Foto/Video':        { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.3)'  },
  'Visuals':           { bg: 'rgba(52,211,153,0.12)',  text: '#34d399', border: 'rgba(52,211,153,0.3)'  },
  'Foto':              { bg: 'rgba(236,72,153,0.12)',  text: '#f472b6', border: 'rgba(236,72,153,0.3)'  },
  'Redacteur':         { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.3)'  },
  'Social Host':       { bg: 'rgba(251,113,133,0.12)', text: '#fb7185', border: 'rgba(251,113,133,0.3)' },
  'Allround':          { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.3)'  },
  'Video (vfx/motion)':{ bg: 'rgba(14,165,233,0.12)', text: '#38bdf8', border: 'rgba(14,165,233,0.3)'  },
  'Grafisch Design':   { bg: 'rgba(234,179,8,0.12)',   text: '#facc15', border: 'rgba(234,179,8,0.3)'   },
  'Online Editor':     { bg: 'rgba(132,204,22,0.12)',  text: '#a3e635', border: 'rgba(132,204,22,0.3)'  },
  'VFX Generalist':    { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.3)'   },
  'Podcasting':        { bg: 'rgba(217,70,239,0.12)',  text: '#e879f9', border: 'rgba(217,70,239,0.3)'  },
}

const TYPE_ICONS: Record<FreelancerType, React.ReactNode> = {
  'Story':             <Clapperboard size={11} />,
  'Video':             <Video size={11} />,
  'Foto/Video':        <Camera size={11} />,
  'Visuals':           <Palette size={11} />,
  'Foto':              <Camera size={11} />,
  'Redacteur':         <BookOpen size={11} />,
  'Social Host':       <Users size={11} />,
  'Allround':          <Layers size={11} />,
  'Video (vfx/motion)':<Wand2 size={11} />,
  'Grafisch Design':   <PenTool size={11} />,
  'Online Editor':     <MonitorPlay size={11} />,
  'VFX Generalist':    <Zap size={11} />,
  'Podcasting':        <Mic size={11} />,
}

type TestedStatus = 'nee' | 'weinig' | 'ja'
const TESTED_CONFIG: Record<TestedStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  nee:    { label: 'Niet getest',  dot: '#ef4444', bg: 'rgba(239,68,68,0.1)',    text: '#f87171', border: 'rgba(239,68,68,0.3)'    },
  weinig: { label: 'Weinig getest', dot: '#f97316', bg: 'rgba(249,115,22,0.1)',   text: '#fb923c', border: 'rgba(249,115,22,0.3)'   },
  ja:     { label: 'Getest',       dot: '#22c55e', bg: 'rgba(34,197,94,0.1)',    text: '#4ade80', border: 'rgba(34,197,94,0.3)'    },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FreelancerProject {
  id: string
  freelancer_id: string
  project_name: string
  description: string | null
  client_name: string | null
  date: string | null
  score: number | null
  notes: string | null
}

interface Freelancer {
  id: string
  name: string
  email: string | null
  phone: string | null
  // New fields
  types: FreelancerType[]
  tested: TestedStatus | null
  price_info: string | null
  rating: number | null          // 1–5 stars
  portfolio_url: string | null
  avatar_url: string | null
  notes: string | null
  // Legacy (kept for backward compat)
  specialties: string[]
  hourly_rate: number | null
  bio: string | null
  freelancer_projects: { id: string; score: number | null }[]
}

interface MatchResult extends Freelancer {
  match_reason: string
  match_concern: string | null
  match_rank: number
}

interface FreelancerAssignmentFile {
  id: string
  file_name: string
  file_url: string
  file_size: number | null
  file_type: string | null
  storage_provider?: string | null
  thumbnail_link?: string | null
}

interface FreelancerAssignment {
  id: string
  freelancer_id: string
  title: string
  briefing: string | null
  deadline: string | null
  client_name: string | null
  status: 'nieuw' | 'in_behandeling' | 'afgerond'
  created_at: string
  freelancer_assignment_files: FreelancerAssignmentFile[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function avatarColor(name: string) {
  const colors = ['#3A913F','#0ea5e9','#f59e0b','#a855f7','#ec4899','#14b8a6','#f97316']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

function Avatar({ name, avatarUrl, size = 40, opacity = 1 }: {
  name: string
  avatarUrl: string | null
  size?: number
  opacity?: number
}) {
  const color = avatarColor(name)
  const radius = size >= 64 ? '20px' : size >= 40 ? '12px' : '8px'
  const fontSize = size >= 64 ? '22px' : size >= 40 ? '14px' : '10px'
  if (avatarUrl) {
    return (
      <div className="overflow-hidden flex-shrink-0"
        style={{ width: size, height: size, opacity, borderRadius: radius }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, opacity, borderRadius: radius, fontSize }}>
      {initials(name)}
    </div>
  )
}

function RatingStars({ value, onChange, size = 18 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value ?? 0
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(value === n ? 0 : n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(null)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          disabled={!onChange}
        >
          <Star
            size={size}
            fill={n <= display ? '#f59e0b' : 'transparent'}
            stroke={n <= display ? '#f59e0b' : '#52525b'}
            className="transition-colors"
          />
        </button>
      ))}
    </div>
  )
}

function TestedBadge({ status }: { status: TestedStatus }) {
  const c = TESTED_CONFIG[status]
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
      {c.label}
    </span>
  )
}

function TypeBadge({ type, small }: { type: FreelancerType; small?: boolean }) {
  const s = TYPE_STYLES[type]
  return (
    <span className={`flex items-center gap-1 rounded-full font-medium ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {TYPE_ICONS[type]}
      {type}
    </span>
  )
}

// ─── Add Freelancer Modal ─────────────────────────────────────────────────────

function AddFreelancerModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: (f: Freelancer) => void
}) {
  const [name,         setName]         = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [types,        setTypes]        = useState<FreelancerType[]>([])
  const [tested,       setTested]       = useState<TestedStatus | null>(null)
  const [priceInfo,    setPriceInfo]    = useState('')
  const [rating,       setRating]       = useState<number | null>(null)
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleType(t: FreelancerType) {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Geef een naam op.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/freelancers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          types,
          tested: tested || null,
          price_info: priceInfo.trim() || null,
          rating: rating || null,
          portfolio_url: portfolioUrl.trim() || null,
          notes: notes.trim() || null,
          specialties: [],
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Fout')
      onAdded(data); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    }
    setSaving(false)
  }

  const inputCls = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors'
  const labelCls = 'block text-xs text-zinc-500 uppercase tracking-wider mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Freelancer toevoegen</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Naam */}
          <div>
            <label className={labelCls}>Naam *</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="bijv. Thomas Janssen" className={inputCls} />
          </div>

          {/* Type (Wat?) */}
          <div>
            <label className={labelCls}>Type (Wat?)</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => {
                const active = types.includes(t)
                const s = TYPE_STYLES[t]
                return (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={active
                      ? { backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }
                      : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {TYPE_ICONS[t]}
                    {t}
                    {active && <Check size={10} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* GSM + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>GSM nummer</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+32 ..." className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>E-mailadres</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="naam@email.com" className={inputCls} />
            </div>
          </div>

          {/* Getest? */}
          <div>
            <label className={labelCls}>Getest?</label>
            <div className="flex items-center gap-2">
              {(['nee', 'weinig', 'ja'] as TestedStatus[]).map(s => {
                const c = TESTED_CONFIG[s]
                const active = tested === s
                return (
                  <button key={s} type="button"
                    onClick={() => setTested(active ? null : s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={active
                      ? { backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }
                      : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? c.dot : '#52525b' }} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prijs */}
          <div>
            <label className={labelCls}>Prijs</label>
            <input type="text" value={priceInfo} onChange={e => setPriceInfo(e.target.value)}
              placeholder="bijv. €350/dag, €50/uur, negotiable…" className={inputCls} />
          </div>

          {/* Beoordeling */}
          <div>
            <label className={labelCls}>Beoordeling</label>
            <RatingStars value={rating} onChange={v => setRating(v || null)} size={22} />
          </div>

          {/* Portfolio */}
          <div>
            <label className={labelCls}>Portfolio</label>
            <input type="url" value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)}
              placeholder="https://portfolio.com/..." className={inputCls} />
          </div>

          {/* Notities */}
          <div>
            <label className={labelCls}>Notities</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Aandachtspunten, stijl, sterke punten…"
              className={`${inputCls} resize-none`} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
              <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Annuleren</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Freelancer Detail Panel ──────────────────────────────────────────────────

function FreelancerDetail({ freelancer, onClose, onDeleted, onUpdated, onProjectAdded, onProjectDeleted, isAdmin }: {
  freelancer: Freelancer
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (f: Freelancer) => void
  onProjectAdded: (p: FreelancerProject, newRating: number | null) => void
  onProjectDeleted: (projectId: string, newRating: number | null) => void
  isAdmin: boolean
}) {
  const [projects,          setProjects]          = useState<FreelancerProject[]>([])
  const [loadingProjects,   setLoadingProjects]   = useState(true)
  const [addingProject,     setAddingProject]     = useState(false)
  const [confirmDelete,     setConfirmDelete]     = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [assignments,       setAssignments]       = useState<FreelancerAssignment[]>([])
  const [loadingAssignments,setLoadingAssignments]= useState(true)
  const [addingAssignment,  setAddingAssignment]  = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<FreelancerAssignment | null>(null)

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/freelancers/${freelancer.id}/avatar`, { method: 'POST', body: fd })
    if (r.ok) { const data = await r.json(); onUpdated(data) }
    setAvatarUploading(false)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true)
    const r = await fetch(`/api/freelancers/${freelancer.id}/avatar`, { method: 'DELETE' })
    if (r.ok) { const data = await r.json(); onUpdated(data) }
    setAvatarUploading(false)
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const [editing,      setEditing]      = useState(false)
  const [editName,     setEditName]     = useState(freelancer.name)
  const [editEmail,    setEditEmail]    = useState(freelancer.email ?? '')
  const [editPhone,    setEditPhone]    = useState(freelancer.phone ?? '')
  const [editTypes,    setEditTypes]    = useState<FreelancerType[]>(freelancer.types ?? [])
  const [editTested,   setEditTested]   = useState<TestedStatus | null>(freelancer.tested ?? null)
  const [editPrice,    setEditPrice]    = useState(freelancer.price_info ?? '')
  const [editRating,   setEditRating]   = useState<number | null>(freelancer.rating ?? null)
  const [editPortfolio,setEditPortfolio]= useState(freelancer.portfolio_url ?? '')
  const [editNotes,    setEditNotes]    = useState(freelancer.notes ?? '')
  const [saving,       setSaving]       = useState(false)
  const [editError,    setEditError]    = useState('')

  function openEdit() {
    setEditName(freelancer.name)
    setEditEmail(freelancer.email ?? '')
    setEditPhone(freelancer.phone ?? '')
    setEditTypes(freelancer.types ?? [])
    setEditTested(freelancer.tested ?? null)
    setEditPrice(freelancer.price_info ?? '')
    setEditRating(freelancer.rating ?? null)
    setEditPortfolio(freelancer.portfolio_url ?? '')
    setEditNotes(freelancer.notes ?? '')
    setEditError('')
    setEditing(true)
  }

  async function handleSave() {
    if (!editName.trim()) { setEditError('Naam is verplicht.'); return }
    setSaving(true); setEditError('')
    try {
      const r = await fetch(`/api/freelancers/${freelancer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          types: editTypes,
          tested: editTested || null,
          price_info: editPrice.trim() || null,
          rating: editRating || null,
          portfolio_url: editPortfolio.trim() || null,
          notes: editNotes.trim() || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Fout')
      onUpdated(data)
      setEditing(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Onbekende fout')
    }
    setSaving(false)
  }

  function toggleEditType(t: FreelancerType) {
    setEditTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    const r = await fetch(`/api/freelancers/${freelancer.id}/projects`)
    setProjects(await r.json())
    setLoadingProjects(false)
  }, [freelancer.id])

  const loadAssignments = useCallback(async () => {
    setLoadingAssignments(true)
    const r = await fetch(`/api/freelancers/${freelancer.id}/assignments`)
    if (r.ok) setAssignments(await r.json())
    setLoadingAssignments(false)
  }, [freelancer.id])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => { loadAssignments() }, [loadAssignments])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (editing) { setEditing(false) } else { onClose() } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  async function handleDeleteFreelancer() {
    setDeleting(true)
    await fetch(`/api/freelancers/${freelancer.id}`, { method: 'DELETE' })
    onDeleted(freelancer.id); onClose()
  }

  async function handleDeleteProject(projectId: string) {
    const r = await fetch(`/api/freelancers/${freelancer.id}/projects/${projectId}`, { method: 'DELETE' })
    setProjects(prev => prev.filter(p => p.id !== projectId))
    if (r.ok) {
      const data = await r.json()
      onProjectDeleted(projectId, data.new_freelancer_rating ?? null)
    } else {
      onProjectDeleted(projectId, null)
    }
  }

  const inputCls = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors'
  const labelCls = 'block text-xs text-zinc-500 uppercase tracking-wider mb-1.5'

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-zinc-900 border-l border-zinc-800 shadow-2xl w-full sm:w-[500px] h-full overflow-y-auto flex flex-col">

          {/* Header */}
          <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar with optional upload overlay */}
              <div className="relative flex-shrink-0">
                {avatarUploading ? (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-800">
                    <Loader2 size={16} className="animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <Avatar name={freelancer.name} avatarUrl={freelancer.avatar_url} size={40} />
                )}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.55)' }}
                      title="Foto wijzigen"
                    >
                      <ImagePlus size={14} className="text-white" />
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                      onChange={handleAvatarChange} />
                  </>
                )}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">{freelancer.name}</h2>
                {freelancer.rating && (
                  <div className="mt-0.5">
                    <RatingStars value={freelancer.rating} size={13} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !editing && (
                <button onClick={openEdit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors">
                  <Pencil size={11} /> Bewerken
                </button>
              )}
              <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={16} /></button>
            </div>
          </div>

          {editing ? (
            /* ── Edit form ── */
            <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
              {/* Avatar remove option */}
              {freelancer.avatar_url && (
                <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                  <Avatar name={freelancer.name} avatarUrl={freelancer.avatar_url} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400">Huidige profielfoto</p>
                  </div>
                  <button onClick={handleAvatarRemove} disabled={avatarUploading}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
                    Verwijder foto
                  </button>
                </div>
              )}
              <div>
                <label className={labelCls}>Naam *</label>
                <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Type (Wat?)</label>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map(t => {
                    const active = editTypes.includes(t)
                    const s = TYPE_STYLES[t]
                    return (
                      <button key={t} type="button" onClick={() => toggleEditType(t)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={active
                          ? { backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }
                          : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {TYPE_ICONS[t]}
                        {t}
                        {active && <Check size={10} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>GSM nummer</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+32 ..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>E-mailadres</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="naam@email.com" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Getest?</label>
                <div className="flex items-center gap-2">
                  {(['nee', 'weinig', 'ja'] as TestedStatus[]).map(s => {
                    const c = TESTED_CONFIG[s]
                    const active = editTested === s
                    return (
                      <button key={s} type="button"
                        onClick={() => setEditTested(active ? null : s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={active
                          ? { backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }
                          : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? c.dot : '#52525b' }} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className={labelCls}>Prijs</label>
                <input type="text" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="bijv. €350/dag, negotiable…" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Beoordeling</label>
                <RatingStars value={editRating} onChange={v => setEditRating(v || null)} size={22} />
              </div>

              <div>
                <label className={labelCls}>Portfolio</label>
                <input type="url" value={editPortfolio} onChange={e => setEditPortfolio(e.target.value)} placeholder="https://portfolio.com/..." className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Notities</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} placeholder="Aandachtspunten, stijl, sterke punten…" className={`${inputCls} resize-none`} />
              </div>

              {editError && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
                  <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-400">{editError}</p>
                </div>
              )}
            </div>
          ) : (
            /* ── View mode ── */
            <div className="flex-1 px-5 py-4 space-y-5">

              {/* Types */}
              {freelancer.types?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {freelancer.types.map(t => <TypeBadge key={t} type={t} />)}
                  {freelancer.tested && <TestedBadge status={freelancer.tested} />}
                </div>
              )}
              {!freelancer.types?.length && freelancer.tested && (
                <TestedBadge status={freelancer.tested} />
              )}

              {/* Contact info */}
              <div className="space-y-2">
                {freelancer.phone && (
                  <a href={`tel:${freelancer.phone}`}
                    className="flex items-center gap-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors group">
                    <Phone size={13} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    {freelancer.phone}
                  </a>
                )}
                {freelancer.email && (
                  <a href={`mailto:${freelancer.email}`}
                    className="flex items-center gap-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors group">
                    <Mail size={13} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    {freelancer.email}
                  </a>
                )}
                {freelancer.price_info && (
                  <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                    <FileText size={13} className="text-zinc-600" />
                    <span className="text-zinc-200 font-medium">{freelancer.price_info}</span>
                  </div>
                )}
                {freelancer.portfolio_url && (
                  <a href={freelancer.portfolio_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors group">
                    <Globe size={13} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    <span className="truncate">{freelancer.portfolio_url.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink size={11} className="text-zinc-600 flex-shrink-0" />
                  </a>
                )}
              </div>

              {/* Notes */}
              {(freelancer.notes || freelancer.bio) && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Notities</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{freelancer.notes || freelancer.bio}</p>
                </div>
              )}

              {/* Assignments */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Opdrachten <span className="text-zinc-600">({assignments.length})</span>
                  </p>
                  <button onClick={() => setAddingAssignment(true)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                    <Plus size={12} /> Opdracht
                  </button>
                </div>

                {loadingAssignments ? (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-zinc-600" /></div>
                ) : assignments.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic py-3 text-center">Nog geen opdrachten.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map(a => (
                      <AssignmentAdminRow key={a.id} assignment={a}
                        onClick={() => setEditingAssignment(a)}
                        onDelete={async () => {
                          await fetch(`/api/freelancers/${freelancer.id}/assignments/${a.id}`, { method: 'DELETE' })
                          setAssignments(prev => prev.filter(x => x.id !== a.id))
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Projects */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Projectgeschiedenis <span className="text-zinc-600">({projects.length})</span>
                  </p>
                  <button onClick={() => setAddingProject(true)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                    <Plus size={12} /> Project
                  </button>
                </div>

                {loadingProjects ? (
                  <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>
                ) : projects.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic py-4 text-center">Nog geen projecten toegevoegd.</p>
                ) : (
                  <div className="space-y-2">
                    {projects.map(p => (
                      <ProjectRow key={p.id} project={p} onDelete={() => handleDeleteProject(p.id)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-5 py-3">
            {editing ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Annuleren
                </button>
                <button onClick={handleSave} disabled={saving || !editName.trim()}
                  className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: '#3A913F' }}>
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Opslaan
                </button>
              </div>
            ) : isAdmin ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 flex-1">Freelancer verwijderen?</span>
                  <button onClick={handleDeleteFreelancer} disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg hover:bg-red-950/60 transition-colors disabled:opacity-50">
                    {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    Ja, verwijder
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    Nee
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-xs text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                  Freelancer verwijderen
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>

      {addingProject && (
        <AddProjectModal
          freelancerId={freelancer.id}
          freelancerName={freelancer.name}
          onClose={() => setAddingProject(false)}
          onAdded={(p, newRating) => { setProjects(prev => [p, ...prev]); onProjectAdded(p, newRating) }}
        />
      )}

      {addingAssignment && (
        <AddAssignmentModal
          freelancerId={freelancer.id}
          freelancerName={freelancer.name}
          onClose={() => setAddingAssignment(false)}
          onAdded={(a) => setAssignments(prev => [a, ...prev])}
        />
      )}

      {editingAssignment && (
        <EditAssignmentModal
          key={editingAssignment.id}
          freelancerId={freelancer.id}
          assignment={editingAssignment}
          onClose={() => setEditingAssignment(null)}
          onSaved={(a) => setAssignments(prev => prev.map(x => x.id === a.id ? a : x))}
        />
      )}
    </>
  )
}

// ─── Assignment Admin Row ─────────────────────────────────────────────────────

const ASSIGNMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  nieuw:          { label: 'Nieuw',          color: '#3b82f6' },
  in_behandeling: { label: 'In behandeling', color: '#f59e0b' },
  afgerond:       { label: 'Afgerond',       color: '#22c55e' },
}

function AssignmentAdminRow({ assignment: a, onClick, onDelete }: {
  assignment: FreelancerAssignment
  onClick: () => void
  onDelete: () => Promise<void>
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const st = ASSIGNMENT_STATUS_LABELS[a.status] ?? { label: a.status, color: '#71717a' }

  return (
    <div onClick={onClick} className="px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.06]"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-medium text-zinc-200 truncate">{a.title}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: st.color, backgroundColor: `${st.color}18` }}>
              {st.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            {a.client_name && <span>{a.client_name}</span>}
            {a.deadline && <span>{new Date(a.deadline).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            {a.freelancer_assignment_files.length > 0 && <span>{a.freelancer_assignment_files.length} bestand{a.freelancer_assignment_files.length !== 1 ? 'en' : ''}</span>}
          </div>
        </div>
        {confirmDel ? (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={async () => { setDeleting(true); await onDelete(); setDeleting(false) }} disabled={deleting}
              className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors">
              {deleting ? <Loader2 size={10} className="animate-spin inline" /> : 'Verwijder'}
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-1">Nee</button>
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); setConfirmDel(true) }} className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// Fetches the client list once for the assignment modals' client dropdown —
// client_name on an assignment stays a plain text column (no schema change),
// this just replaces free typing with picking from the existing client list.
function useClientNames(): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.ok ? r.json() : [])
      .then((data: { name: string }[]) => setNames(data.map(c => c.name)))
      .catch(() => {})
  }, [])
  return names
}

// ─── Add Assignment Modal ─────────────────────────────────────────────────────

function AddAssignmentModal({ freelancerId, freelancerName, onClose, onAdded }: {
  freelancerId: string
  freelancerName: string
  onClose: () => void
  onAdded: (a: FreelancerAssignment) => void
}) {
  const [title,      setTitle]      = useState('')
  const [briefing,   setBriefing]   = useState('')
  const [deadline,   setDeadline]   = useState('')
  const [clientName, setClientName] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [files,      setFiles]      = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const clientNames = useClientNames()

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }

  async function handleSubmit() {
    if (!title.trim()) { setError('Geef een titel op.'); return }
    setSaving(true); setError('')

    const r = await fetch(`/api/freelancers/${freelancerId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), briefing: briefing.trim() || null, deadline: deadline || null, client_name: clientName.trim() || null }),
    })

    if (!r.ok) { setError('Fout bij aanmaken.'); setSaving(false); return }
    const assignment: FreelancerAssignment = await r.json()

    // Upload files if any
    if (files.length > 0) {
      setUploadingFiles(true)
      await Promise.all(files.map(async file => {
        const fd = new FormData()
        fd.append('file', file)
        const fr = await fetch(`/api/freelancers/${freelancerId}/assignments/${assignment.id}/files`, { method: 'POST', body: fd })
        if (fr.ok) {
          const savedFile = await fr.json()
          assignment.freelancer_assignment_files.push(savedFile)
        }
      }))
      setUploadingFiles(false)
    }

    onAdded(assignment)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold text-white">Opdracht voor {freelancerName}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Titel *</label>
            <input autoFocus type="text" placeholder="bv. Social content KRC Genk — mei" value={title}
              onChange={e => setTitle(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Klant</label>
              <select value={clientName} onChange={e => setClientName(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Geen klant —</option>
                {clientNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className={inputClass} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Briefing & instructies</label>
            <textarea rows={5} placeholder="Geef hier de volledige briefing, instructies en verwachtingen…"
              value={briefing} onChange={e => setBriefing(e.target.value)}
              className={`${inputClass} resize-none leading-relaxed`} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Bestanden</label>
            <div onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <Plus size={13} />
              {files.length > 0 ? `${files.length} bestand${files.length !== 1 ? 'en' : ''} geselecteerd` : 'Bestanden toevoegen'}
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-1 rounded text-xs text-zinc-400"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-zinc-600 hover:text-red-400 flex-shrink-0"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Annuleren</button>
          <button onClick={handleSubmit} disabled={saving || uploadingFiles || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
            style={{ background: '#3A913F' }}>
            {(saving || uploadingFiles) && <Loader2 size={13} className="animate-spin" />}
            {uploadingFiles ? 'Bestanden uploaden…' : saving ? 'Opslaan…' : 'Opdracht aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Assignment Modal ────────────────────────────────────────────────────
// Doubles as the "view detail" screen — clicking an assignment row opens this
// pre-filled, since there was previously no way to see a briefing again (or
// change anything) once an assignment had been created.

function EditAssignmentModal({ freelancerId, assignment, onClose, onSaved }: {
  freelancerId: string
  assignment: FreelancerAssignment
  onClose: () => void
  onSaved: (a: FreelancerAssignment) => void
}) {
  const [title,      setTitle]      = useState(assignment.title)
  const [briefing,   setBriefing]   = useState(assignment.briefing ?? '')
  const [deadline,   setDeadline]   = useState(assignment.deadline ? assignment.deadline.slice(0, 10) : '')
  const [clientName, setClientName] = useState(assignment.client_name ?? '')
  const [status,     setStatus]     = useState(assignment.status)
  const [files,      setFiles]      = useState(assignment.freelancer_assignment_files)
  const [newFiles,   setNewFiles]   = useState<File[]>([])
  const [saving,         setSaving]         = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const clientNames = useClientNames()

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }

  async function handleDeleteFile(fileId: string) {
    setDeletingFileId(fileId)
    await fetch(`/api/freelancers/${freelancerId}/assignments/${assignment.id}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })
    setFiles(prev => prev.filter(f => f.id !== fileId))
    setDeletingFileId(null)
  }

  async function handleSave() {
    if (!title.trim()) { setError('Geef een titel op.'); return }
    setSaving(true); setError('')

    let allFiles = files
    if (newFiles.length > 0) {
      setUploadingFiles(true)
      const uploaded = await Promise.all(newFiles.map(async file => {
        const fd = new FormData()
        fd.append('file', file)
        const fr = await fetch(`/api/freelancers/${freelancerId}/assignments/${assignment.id}/files`, { method: 'POST', body: fd })
        return fr.ok ? await fr.json() as FreelancerAssignmentFile : null
      }))
      allFiles = [...files, ...uploaded.filter((f): f is FreelancerAssignmentFile => f !== null)]
      setFiles(allFiles)
      setNewFiles([])
      setUploadingFiles(false)
    }

    const r = await fetch(`/api/freelancers/${freelancerId}/assignments/${assignment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        briefing: briefing.trim() || null,
        deadline: deadline || null,
        client_name: clientName.trim() || null,
        status,
      }),
    })

    if (!r.ok) { setError('Fout bij opslaan.'); setSaving(false); return }
    const updated: FreelancerAssignment = await r.json()
    onSaved({ ...updated, freelancer_assignment_files: allFiles })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold text-white">Opdracht bewerken</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Titel *</label>
            <input autoFocus type="text" value={title}
              onChange={e => setTitle(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Klant</label>
              <select value={clientName} onChange={e => setClientName(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— Geen klant —</option>
                {/* Preserve a legacy/renamed client_name that no longer matches
                    any current client, so opening this modal can't silently
                    swap it to a different value on save. */}
                {clientName && !clientNames.includes(clientName) && (
                  <option value={clientName}>{clientName}</option>
                )}
                {clientNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className={inputClass} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as FreelancerAssignment['status'])}
              className={inputClass} style={inputStyle}>
              <option value="nieuw">Nieuw</option>
              <option value="in_behandeling">In behandeling</option>
              <option value="afgerond">Afgerond</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Briefing & instructies</label>
            <textarea rows={5} placeholder="Geef hier de volledige briefing, instructies en verwachtingen…"
              value={briefing} onChange={e => setBriefing(e.target.value)}
              className={`${inputClass} resize-none leading-relaxed`} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Bestanden</label>
            {files.length > 0 && (
              <div className="space-y-1 mb-2">
                {files.map(f => {
                  const isVideo = f.file_type?.startsWith('video/') ?? false
                  const hasThumbnail = f.storage_provider === 'drive' && !!f.thumbnail_link
                  return (
                  <div key={f.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs text-zinc-300"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <a href={`/api/freelancers/${freelancerId}/assignments/${assignment.id}/files?fileId=${f.id}`}
                      className="flex items-center gap-1.5 truncate hover:text-white transition-colors min-w-0">
                      {hasThumbnail ? (
                        <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
                          <DriveThumbnail src={f.thumbnail_link!} alt={f.file_name} video={isVideo} />
                        </div>
                      ) : (
                        <Download size={11} className="flex-shrink-0 text-zinc-600" />
                      )}
                      <span className="truncate">{f.file_name}</span>
                    </a>
                    <button onClick={() => handleDeleteFile(f.id)} disabled={deletingFileId === f.id}
                      className="text-zinc-600 hover:text-red-400 flex-shrink-0 disabled:opacity-40">
                      {deletingFileId === f.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                    </button>
                  </div>
                  )
                })}
              </div>
            )}
            <div onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <Plus size={13} />
              {newFiles.length > 0 ? `${newFiles.length} nieuw bestand${newFiles.length !== 1 ? 'en' : ''}` : 'Bestanden toevoegen'}
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
            </div>
            {newFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {newFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-1 rounded text-xs text-zinc-400"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-zinc-600 hover:text-red-400 flex-shrink-0"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Annuleren</button>
          <button onClick={handleSave} disabled={saving || uploadingFiles || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
            style={{ background: '#3A913F' }}>
            {(saving || uploadingFiles) && <Loader2 size={13} className="animate-spin" />}
            {uploadingFiles ? 'Bestanden uploaden…' : saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Project Modal ────────────────────────────────────────────────────────

function AddProjectModal({ freelancerId, freelancerName, onClose, onAdded }: {
  freelancerId: string
  freelancerName: string
  onClose: () => void
  onAdded: (p: FreelancerProject, newRating: number | null) => void
}) {
  const [projectName,  setProjectName]  = useState('')
  const [description,  setDescription]  = useState('')
  const [clientName,   setClientName]   = useState('')
  const [date,         setDate]         = useState('')
  const [score,        setScore]        = useState<number | null>(null)
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    if (!projectName.trim()) { setError('Geef een projectnaam op.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/freelancers/${freelancerId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: projectName, description: description.trim() || null, client_name: clientName, date: date || null, score, notes }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Fout')
      const { new_freelancer_rating, ...project } = data
      onAdded(project as FreelancerProject, new_freelancer_rating ?? null); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fout')
    }
    setSaving(false)
  }

  const inputCls = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Project toevoegen</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{freelancerName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Projectnaam *</label>
            <input autoFocus type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
              placeholder="bijv. Pro League matchday" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Beschrijving</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Wat was de opdracht?" className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Klant</label>
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="bijv. Pro League" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Datum</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Score</label>
            <RatingStars value={score} onChange={v => setScore(v || null)} size={24} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Notitie</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Hoe is het verlopen?" className={`${inputCls} resize-none`} />
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-lg">
              <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Annuleren</button>
          <button onClick={handleSubmit} disabled={saving || !projectName.trim()}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Project Row ──────────────────────────────────────────────────────────────

function ProjectRow({ project: p, onDelete }: { project: FreelancerProject; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl group"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-200">{p.project_name}</span>
          {p.client_name && <span className="text-[10px] text-zinc-600">{p.client_name}</span>}
          {p.date && <span className="text-[10px] text-zinc-600">{new Date(p.date + 'T12:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>
        {p.score !== null && (
          <div className="mt-1">
            <RatingStars value={p.score} size={12} />
          </div>
        )}
        {p.description && <p className="text-xs text-zinc-400 mt-1">{p.description}</p>}
        {p.notes && <p className="text-xs text-zinc-500 mt-1">{p.notes}</p>}
      </div>
      <div className="flex-shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={onDelete} className="p-1 text-red-400 hover:text-red-300 transition-colors"><Check size={12} /></button>
            <button onClick={() => setConfirming(false)} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"><X size={12} /></button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Freelancer Row ───────────────────────────────────────────────────────────

const RANK_STYLES = [
  { label: '#1', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)', text: '#fbbf24', dot: '#fbbf24' },
  { label: '#2', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', text: '#94a3b8', dot: '#94a3b8' },
  { label: '#3', bg: 'rgba(180,120,80,0.10)', border: 'rgba(180,120,80,0.25)', text: '#cd7f32', dot: '#cd7f32' },
]

function FreelancerRow({ freelancer, onClick, matchReason, matchConcern, matchRank, variant = 'vast' }: {
  freelancer: Freelancer
  onClick: () => void
  matchReason?: string
  matchConcern?: string | null
  matchRank?: number
  variant?: 'vast' | 'te_testen'
}) {
  const isTeTesten = variant === 'te_testen'
  const rankStyle = matchRank ? RANK_STYLES[matchRank - 1] : null

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
      style={rankStyle
        ? { background: rankStyle.bg, border: `1.5px solid ${rankStyle.border}` }
        : isTeTesten
          ? { background: 'rgba(14,14,14,0.97)', border: '1px dashed rgba(255,255,255,0.07)' }
          : { background: 'rgba(22,22,22,0.97)', border: '1px solid rgba(255,255,255,0.09)' }
      }
    >
      {/* Rank badge */}
      {rankStyle && (
        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: `${rankStyle.dot}22`, color: rankStyle.dot, border: `1px solid ${rankStyle.dot}44` }}>
          {rankStyle.label}
        </div>
      )}

      {/* Avatar */}
      <Avatar name={freelancer.name} avatarUrl={freelancer.avatar_url} size={40} opacity={isTeTesten ? 0.5 : 1} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight ${isTeTesten ? 'text-zinc-500' : 'text-zinc-100'}`}>
          {freelancer.name}
        </p>
        {freelancer.types?.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {freelancer.types.map(t => <TypeBadge key={t} type={t} small />)}
          </div>
        )}
        {matchReason && (
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{matchReason}</p>
        )}
        {matchConcern && (
          <div className="flex items-start gap-1.5 mt-1 px-2 py-1 rounded bg-amber-950/30 border border-amber-900/30">
            <span className="text-amber-400 text-xs flex-shrink-0">⚠</span>
            <p className="text-xs text-amber-400/80 leading-relaxed">{matchConcern}</p>
          </div>
        )}
      </div>

      {/* Right: rating + price */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        {freelancer.rating
          ? <RatingStars value={freelancer.rating} size={13} />
          : <span className="text-xs text-zinc-700">–</span>
        }
        {freelancer.price_info && (
          <span className="text-xs text-zinc-500">{freelancer.price_info}</span>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FREELANCER_ADMIN = 'deryan.spiessens@sporthousegroup.com'

function sortByRating<T extends Freelancer>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    if (a.rating === b.rating) return 0
    if (a.rating === null) return 1
    if (b.rating === null) return -1
    return b.rating - a.rating
  })
}

export default function FreelancersPage() {
  const [freelancers,  setFreelancers]  = useState<Freelancer[]>([])
  const [loading,      setLoading]      = useState(true)
  const [addModal,     setAddModal]     = useState(false)
  const [selected,     setSelected]     = useState<Freelancer | null>(null)
  const [matchQuery,   setMatchQuery]   = useState('')
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchError,   setMatchError]   = useState('')
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [typeFilters,  setTypeFilters]  = useState<FreelancerType[]>([])

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data: { user } }) => {
        setIsAdmin(user?.email === FREELANCER_ADMIN)
      })
    })
    fetch('/api/freelancers')
      .then(r => r.json())
      .then(data => { setFreelancers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleMatch() {
    if (!matchQuery.trim()) return
    setMatchLoading(true); setMatchError(''); setMatchResults(null)
    try {
      const r = await fetch('/api/freelancers/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: matchQuery, freelancers }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error('Fout bij ophalen')
      setMatchResults(data)
    } catch {
      setMatchError('Er ging iets mis. Probeer opnieuw.')
    }
    setMatchLoading(false)
  }

  function clearMatch() { setMatchResults(null); setMatchQuery(''); setMatchError('') }

  const displayFreelancers = matchResults ?? freelancers

  // Types that are actually in use — for filter chips
  const usedTypes = TYPES.filter(t => freelancers.some(f => f.types?.includes(t)))

  // Split, filter by types (OR logic), sort by rating
  const applyFilters = <T extends Freelancer>(arr: T[]) =>
    sortByRating(typeFilters.length > 0 ? arr.filter(f => typeFilters.some(t => f.types?.includes(t))) : arr)

  const vasteFreelancers = applyFilters(displayFreelancers.filter(f => f.tested === 'ja') as MatchResult[])
  const teTesten         = applyFilters(displayFreelancers.filter(f => f.tested !== 'ja') as MatchResult[])
  const totalVisible     = vasteFreelancers.length + teTesten.length

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Freelancers</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {vasteFreelancers.length} vast · {teTesten.length} te testen
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#3A913F' }}>
            <Plus size={13} />
            Toevoegen
          </button>
        )}
      </div>

      {/* AI Match */}
      <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-zinc-800">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={matchQuery}
              onChange={e => setMatchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleMatch() }}
              placeholder="Beschrijf je project — AI zoekt de beste match…"
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
          {matchResults ? (
            <button onClick={clearMatch} className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-xl transition-colors">
              Wis
            </button>
          ) : (
            <button onClick={handleMatch} disabled={matchLoading || !matchQuery.trim()}
              className="px-4 py-2 text-xs font-medium text-white rounded-xl disabled:opacity-50 transition-colors flex items-center gap-1.5"
              style={{ backgroundColor: '#3A913F' }}>
              {matchLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Match
            </button>
          )}
        </div>
        {matchError && <p className="text-xs text-red-400 mt-2">{matchError}</p>}
        {matchResults && (
          <p className="text-xs text-zinc-500 mt-2">
            Top {matchResults.length} beste {matchResults.length === 1 ? 'match' : 'matches'} — gerangschikt van beste naar minste fit
          </p>
        )}

        {/* Type filter chips */}
        {usedTypes.length > 0 && !matchResults && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {usedTypes.map(t => {
              const active = typeFilters.includes(t)
              const s = TYPE_STYLES[t]
              return (
                <button key={t} onClick={() => setTypeFilters(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                  style={active
                    ? { backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }
                    : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#71717a', border: '1px solid rgba(255,255,255,0.08)' }
                  }>
                  {TYPE_ICONS[t]}
                  {t}
                </button>
              )
            })}
            {typeFilters.length > 0 && (
              <button onClick={() => setTypeFilters([])}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                <X size={10} /> Wis filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-zinc-600" />
          </div>
        ) : totalVisible === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-zinc-500">
              {matchResults ? 'Geen matches gevonden.' : typeFilters.length > 0 ? 'Geen freelancers gevonden voor deze filters.' : 'Nog geen freelancers toegevoegd.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Vaste freelancers ── */}
            {vasteFreelancers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Vaste freelancers</p>
                  <span className="text-xs text-zinc-600">{vasteFreelancers.length}</span>
                </div>
                <div className="space-y-2">
                  {vasteFreelancers.map(f => (
                    <FreelancerRow
                      key={f.id}
                      freelancer={f}
                      variant="vast"
                      onClick={() => setSelected(f)}
                      matchReason={'match_reason' in f ? (f as MatchResult).match_reason : undefined}
                      matchConcern={'match_concern' in f ? (f as MatchResult).match_concern : undefined}
                      matchRank={'match_rank' in f ? (f as MatchResult).match_rank : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Te testen ── */}
            {teTesten.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Te testen</p>
                  <span className="text-xs text-zinc-600">{teTesten.length}</span>
                </div>
                <div className="space-y-2">
                  {teTesten.map(f => (
                    <FreelancerRow
                      key={f.id}
                      freelancer={f}
                      variant="te_testen"
                      onClick={() => setSelected(f)}
                      matchReason={'match_reason' in f ? (f as MatchResult).match_reason : undefined}
                      matchConcern={'match_concern' in f ? (f as MatchResult).match_concern : undefined}
                      matchRank={'match_rank' in f ? (f as MatchResult).match_rank : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {addModal && (
        <AddFreelancerModal
          onClose={() => setAddModal(false)}
          onAdded={f => setFreelancers(prev => [...prev, f])}
        />
      )}

      {selected && (
        <FreelancerDetail
          freelancer={selected}
          onClose={() => setSelected(null)}
          onDeleted={id => { setFreelancers(prev => prev.filter(f => f.id !== id)); setSelected(null) }}
          onUpdated={updated => {
            setFreelancers(prev => prev.map(f => f.id === updated.id ? updated : f))
            setSelected(updated)
          }}
          onProjectAdded={(_p, newRating) => {
            setFreelancers(prev => prev.map(f => f.id === selected.id ? { ...f, rating: newRating } : f))
            setSelected(prev => prev ? { ...prev, rating: newRating } : prev)
          }}
          onProjectDeleted={(_projectId, newRating) => {
            setFreelancers(prev => prev.map(f => f.id === selected.id ? { ...f, rating: newRating } : f))
            setSelected(prev => prev ? { ...prev, rating: newRating } : prev)
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
