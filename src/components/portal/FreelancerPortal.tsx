'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Download, ChevronRight, ChevronDown, Calendar, Building2, Loader2, CheckCircle2, Clock, AlertCircle, Paperclip } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignmentFile {
  id: string
  file_name: string
  file_url: string
  file_size: number | null
  file_type: string | null
}

interface Assignment {
  id: string
  title: string
  briefing: string | null
  deadline: string | null
  client_name: string | null
  status: 'nieuw' | 'in_behandeling' | 'afgerond'
  created_at: string
  freelancer_assignment_files: AssignmentFile[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const STATUS_CONFIG = {
  nieuw:          { label: 'Nieuw',           color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: AlertCircle },
  in_behandeling: { label: 'In behandeling',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Clock },
  afgerond:       { label: 'Afgerond',        color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: CheckCircle2 },
}

const STATUS_ORDER: Assignment['status'][] = ['nieuw', 'in_behandeling', 'afgerond']

// ─── File row ─────────────────────────────────────────────────────────────────

function FileRow({ file, assignmentId }: { file: AssignmentFile; assignmentId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.file_url, assignmentId }),
      })
      if (!res.ok) throw new Error('Download mislukt')
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url
      a.download = file.file_name
      a.click()
    } catch {
      alert('Download mislukt. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  const ext = file.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-zinc-400"
        style={{ background: 'rgba(255,255,255,0.07)' }}>
        {ext}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{file.file_name}</p>
        {file.file_size && <p className="text-[11px] text-zinc-600 mt-0.5">{formatSize(file.file_size)}</p>}
      </div>
      <button onClick={handleDownload} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-all disabled:opacity-50 flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {loading ? 'Laden…' : 'Downloaden'}
      </button>
    </div>
  )
}

// ─── Assignment card ──────────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  onStatusChange,
}: {
  assignment: Assignment
  onStatusChange: (id: string, status: Assignment['status']) => void
}) {
  const [expanded, setExpanded] = useState(assignment.status !== 'afgerond')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const cfg = STATUS_CONFIG[assignment.status]
  const StatusIcon = cfg.icon

  const isDeadlineSoon = assignment.deadline
    ? (new Date(assignment.deadline).getTime() - Date.now()) / 86400000 <= 3
    : false
  const isOverdue = assignment.deadline
    ? new Date(assignment.deadline) < new Date() && assignment.status !== 'afgerond'
    : false

  async function cycleStatus() {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(assignment.status) + 1) % STATUS_ORDER.length]
    setUpdatingStatus(true)
    const res = await fetch(`/api/portal/assignments/${assignment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) onStatusChange(assignment.id, next)
    setUpdatingStatus(false)
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>

      {/* Card header */}
      <button className="w-full text-left px-5 py-4 flex items-start gap-4"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            {/* Status badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
              style={{ color: cfg.color, backgroundColor: cfg.bg }}>
              <StatusIcon size={11} />
              {cfg.label}
            </span>

            {assignment.client_name && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Building2 size={10} /> {assignment.client_name}
              </span>
            )}

            {assignment.deadline && (
              <span className={`inline-flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-400' : isDeadlineSoon ? 'text-amber-400' : 'text-zinc-500'}`}>
                <Calendar size={10} />
                {isOverdue ? 'Verlopen — ' : isDeadlineSoon ? 'Bijna — ' : ''}{formatDate(assignment.deadline)}
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-semibold text-zinc-100 leading-snug">{assignment.title}</h3>
          {!expanded && assignment.briefing && (
            <p className="text-sm text-zinc-600 mt-1 line-clamp-1">{assignment.briefing}</p>
          )}
        </div>
        <ChevronDown size={16} className={`text-zinc-600 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Briefing */}
          {assignment.briefing && (
            <div className="mt-4">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Briefing & instructies</p>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap rounded-xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {assignment.briefing}
              </div>
            </div>
          )}

          {/* Files */}
          {assignment.freelancer_assignment_files.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Paperclip size={10} /> Bestanden ({assignment.freelancer_assignment_files.length})
              </p>
              <div className="space-y-2">
                {assignment.freelancer_assignment_files.map(f => (
                  <FileRow key={f.id} file={f} assignmentId={assignment.id} />
                ))}
              </div>
            </div>
          )}

          {/* Status update */}
          {assignment.status !== 'afgerond' && (
            <div className="mt-4 flex justify-end">
              <button onClick={cycleStatus} disabled={updatingStatus}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
                style={{ background: assignment.status === 'nieuw' ? '#f59e0b' : '#22c55e' }}>
                {updatingStatus
                  ? <Loader2 size={13} className="animate-spin" />
                  : <ChevronRight size={13} />}
                {assignment.status === 'nieuw' ? 'Markeer als gestart' : 'Markeer als afgerond'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export default function FreelancerPortal({ freelancerName }: {
  freelancerId: string
  freelancerName: string
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/portal/assignments')
    if (res.ok) setAssignments(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusChange(id: string, status: Assignment['status']) {
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const active   = assignments.filter(a => a.status !== 'afgerond')
  const finished = assignments.filter(a => a.status === 'afgerond')

  return (
    <div>
      {/* Greeting */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white tracking-tight mb-1">
          Welkom, {freelancerName.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-zinc-500">Hier vind je al je opdrachten, briefings en bestanden.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-600">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Laden…</span>
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <FileText size={22} className="text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium mb-1">Nog geen opdrachten</p>
          <p className="text-sm text-zinc-600">Je opdrachten verschijnen hier zodra Sporthouse ze toewijst.</p>
        </div>
      ) : (
        <>
          {/* Active assignments */}
          {active.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: '#3A913F' }} />
                <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Openstaande opdrachten</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(58,145,63,0.15)', color: '#3A913F', border: '1px solid rgba(58,145,63,0.25)' }}>
                  {active.length}
                </span>
              </div>
              <div className="space-y-3">
                {active.map(a => (
                  <AssignmentCard key={a.id} assignment={a} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>
          )}

          {/* Finished assignments */}
          {finished.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-0.5 h-4 rounded-full bg-zinc-700" />
                <h2 className="text-sm font-semibold text-zinc-500 tracking-wide">Afgerond</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-zinc-600"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {finished.length}
                </span>
              </div>
              <div className="space-y-3 opacity-60">
                {finished.map(a => (
                  <AssignmentCard key={a.id} assignment={a} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
