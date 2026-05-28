'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Download, Trash2, X, Plus, Loader2,
  ImageIcon, Film, Layers, Settings, ChevronDown, ArrowLeft, User,
} from 'lucide-react'
import JSZip from 'jszip'
import { Client } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Edition {
  id: string
  title: string
  active: boolean
  created_at: string
}

interface Submission {
  id: string
  edition_id: string
  section: 'content' | 'inspiratie'
  title: string | null
  file_url: string
  file_name: string
  file_type: string
  file_size: number | null
  submitted_by_id: string
  submitted_by_name: string
  client_id: string | null
  client_name: string | null
  created_at: string
  signedUrl?: string
}

type Section = 'content' | 'inspiratie'

const CATEGORY_LABEL: Record<string, string> = {
  klant: 'Klanten', atleet: 'Atleten', intern: 'Intern', podcast: 'Podcasts',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isVideo(type: string) { return type.startsWith('video/') }

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({ sub, canDelete, onDelete }: {
  sub: Submission
  canDelete: boolean
  onDelete: (id: string, filePath: string) => void
}) {
  const video = isVideo(sub.file_type)

  return (
    <div className="group relative rounded-xl overflow-hidden"
      style={{ background: 'rgba(22,22,22,0.98)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="relative aspect-video bg-zinc-900 overflow-hidden">
        {sub.signedUrl ? (
          video ? (
            <video src={sub.signedUrl} className="w-full h-full object-cover" preload="metadata" muted
              onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
              onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sub.signedUrl} alt={sub.title ?? sub.file_name} className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            {video ? <Film size={28} /> : <ImageIcon size={28} />}
          </div>
        )}
        {video && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-zinc-300 flex items-center gap-1">
            <Film size={10} /> Video
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {sub.signedUrl && (
            <a href={sub.signedUrl} download={sub.file_name}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Download size={15} />
            </a>
          )}
          {canDelete && (
            <button onClick={() => onDelete(sub.id, sub.file_url)}
              className="p-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5">
        {sub.title && <p className="text-sm text-zinc-200 font-medium truncate mb-1.5">{sub.title}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <User size={11} className="text-zinc-500 flex-shrink-0" />
            <p className="text-xs text-zinc-300 font-medium truncate">{sub.submitted_by_name}</p>
          </div>
          {sub.file_size && <p className="text-xs text-zinc-600 flex-shrink-0">{formatSize(sub.file_size)}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface FileEntry {
  file: File
  clientId: string
  clientName: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

function UploadModal({ section, editionId, userId, userName, onClose, onUploaded }: {
  section: Section
  editionId: string
  userId: string
  userName: string
  onClose: () => void
  onUploaded: () => void
}) {
  const supabase = createClient()
  const [entries,   setEntries]   = useState<FileEntry[]>([])
  const [clients,   setClients]   = useState<Client[]>([])
  const [uploading, setUploading] = useState(false)
  const [done,      setDone]      = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients((data ?? []) as Client[]))
  }, [])

  const groupedClients = Object.entries(
    clients.reduce<Record<string, Client[]>>((acc, c) => {
      const label = CATEGORY_LABEL[c.category] ?? c.category
      ;(acc[label] ??= []).push(c)
      return acc
    }, {})
  )

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const defaultClient = clients[0]
    const newEntries: FileEntry[] = Array.from(incoming)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map(file => ({
        file,
        clientId:   defaultClient?.id   ?? '',
        clientName: defaultClient?.name ?? '',
        status: 'pending' as const,
        progress: 0,
      }))
    setEntries(prev => [...prev, ...newEntries])
  }

  function updateEntry(index: number, clientId: string, clientName: string) {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, clientId, clientName } : e))
  }

  function removeEntry(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (!entries.length || entries.some(e => !e.clientId)) return
    setUploading(true)

    await Promise.all(
      entries.map(async (entry, i) => {
        setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'uploading' } : e))
        try {
          const ext      = entry.file.name.split('.').pop()
          const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          const path     = `${editionId}/${section}/${entry.clientId}/${userId}/${safeName}`

          const { error: uploadError } = await supabase.storage
            .from('preassist').upload(path, entry.file, { upsert: false })
          if (uploadError) throw uploadError

          const { error: dbError } = await supabase.from('preassist_submissions').insert({
            edition_id: editionId, section,
            title:      null,
            file_url:   path, file_name: entry.file.name,
            file_type:  entry.file.type, file_size: entry.file.size,
            submitted_by_id: userId, submitted_by_name: userName,
            client_id: entry.clientId, client_name: entry.clientName,
          })
          if (dbError) throw dbError

          setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'done', progress: 100 } : e))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'error', error: msg } : e))
        }
      })
    )

    setDone(true)
    setTimeout(() => { onUploaded(); onClose() }, 800)
  }

  const allAssigned  = entries.length > 0 && entries.every(e => e.clientId)
  const doneCount    = entries.filter(e => e.status === 'done').length
  const errorCount   = entries.filter(e => e.status === 'error').length

  const selectStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#d4d4d8',
    fontSize: 12,
    borderRadius: 8,
    padding: '4px 8px',
    outline: 'none',
    width: '100%',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-base font-semibold text-white">
            Toevoegen aan {section === 'content' ? 'Content' : 'Inspiratie'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6">
          {/* Drop zone */}
          <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl cursor-pointer mb-5"
            style={{ border: '2px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
            <Upload size={18} className="text-zinc-500" />
            <p className="text-sm text-zinc-400">Klik of sleep bestanden hier</p>
            <p className="text-xs text-zinc-600">Afbeeldingen & video's — meerdere tegelijk mogelijk</p>
            <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {/* File rows */}
          {entries.length > 0 && (
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto pr-1">
              {entries.map((entry, i) => (
                <div key={i} className="rounded-lg overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-3 px-3 py-2">

                    {/* Icon */}
                    {isVideo(entry.file.type)
                      ? <Film size={12} className="text-zinc-500 flex-shrink-0" />
                      : <ImageIcon size={12} className="text-zinc-500 flex-shrink-0" />}

                    {/* File name */}
                    <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{entry.file.name}</span>

                    {/* Size */}
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 hidden sm:block">
                      {formatSize(entry.file.size)}
                    </span>

                    {/* Client selector */}
                    <div className="flex-shrink-0 w-40">
                      <select
                        value={entry.clientId}
                        disabled={uploading}
                        onChange={e => {
                          const opt = clients.find(c => c.id === e.target.value)
                          if (opt) updateEntry(i, opt.id, opt.name)
                        }}
                        style={selectStyle}
                      >
                        <option value="">— Klant —</option>
                        {groupedClients.map(([cat, items]) => (
                          <optgroup key={cat} label={cat}>
                            {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Status / remove */}
                    {uploading ? (
                      <span className="flex-shrink-0 w-4 text-center" style={{
                        color: entry.status === 'done'  ? '#4ade80' :
                               entry.status === 'error' ? '#f87171' : '#a1a1aa',
                        fontSize: 13,
                      }}>
                        {entry.status === 'done'  ? '✓' :
                         entry.status === 'error' ? '✗' :
                         <Loader2 size={12} className="animate-spin inline" />}
                      </span>
                    ) : (
                      <button onClick={() => removeEntry(i)}
                        className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error summary */}
          {errorCount > 0 && (
            <p className="text-xs text-red-400 mb-3">{errorCount} bestand{errorCount !== 1 ? 'en' : ''} mislukt</p>
          )}

          {/* Progress bar when uploading */}
          {uploading && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500">
                  {done ? 'Klaar' : `${doneCount} / ${entries.length} geüpload…`}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${entries.length ? Math.round((doneCount / entries.length) * 100) : 0}%`, backgroundColor: '#3A913F' }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-600">
              {entries.length > 0
                ? `${entries.length} bestand${entries.length !== 1 ? 'en' : ''} geselecteerd`
                : 'Nog geen bestanden'}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                Annuleren
              </button>
              <button onClick={handleUpload} disabled={uploading || !allAssigned}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40 transition-all"
                style={{ background: '#3A913F' }}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading
                  ? `${doneCount}/${entries.length} klaar`
                  : `${entries.length || 0} bestand${entries.length !== 1 ? 'en' : ''} uploaden`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edition Modal ────────────────────────────────────────────────────────────

function EditionModal({ editions, onClose, onRefresh }: {
  editions: Edition[]
  onClose: () => void
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [newTitle,   setNewTitle]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  async function createEdition() {
    if (!newTitle.trim()) return
    setSaving(true)
    await supabase.from('preassist_editions').insert({ title: newTitle.trim(), active: false })
    setNewTitle(''); setSaving(false); onRefresh()
  }

  async function setActive(id: string) {
    await supabase.from('preassist_editions').update({ active: false }).neq('id', id)
    await supabase.from('preassist_editions').update({ active: true }).eq('id', id)
    onRefresh()
  }

  async function deleteEdition(id: string) {
    await supabase.from('preassist_editions').delete().eq('id', id)
    setConfirmDel(null); onRefresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Edities beheren</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-2 mb-5 max-h-52 overflow-y-auto">
          {editions.map(e => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: e.active ? '1px solid rgba(58,145,63,0.4)' : '1px solid transparent' }}>
              <span className="text-sm text-zinc-200 truncate flex-1">{e.title}</span>
              {e.active ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color: '#3A913F', background: 'rgba(58,145,63,0.15)' }}>Actief</span>
              ) : (
                <button onClick={() => setActive(e.id)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">Activeren</button>
              )}
              {confirmDel === e.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => deleteEdition(e.id)}
                    className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors">Zeker?</button>
                  <button onClick={() => setConfirmDel(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">Nee</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(e.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="bv. Q1 2026" value={newTitle}
            onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createEdition()}
            className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={createEdition} disabled={saving || !newTitle.trim()}
            className="px-3 py-2 rounded-lg text-white text-sm disabled:opacity-40 transition-all"
            style={{ background: '#3A913F' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client group ─────────────────────────────────────────────────────────────

function ClientGroup({ clientName, submissions, currentUserId, isAdmin, canDeleteAll, onDelete }: {
  clientName: string
  submissions: Submission[]
  currentUserId: string
  isAdmin: boolean
  canDeleteAll: boolean
  onDelete: (id: string, filePath: string) => void
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: '#3A913F' }} />
        <h3 className="text-sm font-semibold text-zinc-200">{clientName}</h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full text-zinc-500"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {submissions.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {submissions.map(sub => (
          <SubmissionCard key={sub.id} sub={sub}
            canDelete={isAdmin || canDeleteAll || sub.submitted_by_id === currentUserId}
            onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreassistPage({ currentUserId, currentUserName, isAdmin, canManageEditions, canAdd, canDeleteAll }: {
  currentUserId: string
  currentUserName: string
  isAdmin: boolean
  canManageEditions: boolean
  canAdd: boolean
  canDeleteAll: boolean
}) {
  const router = useRouter()
  const supabase = createClient()

  const [editions,      setEditions]      = useState<Edition[]>([])
  const [activeEdition, setActiveEdition] = useState<Edition | null>(null)
  const [submissions,   setSubmissions]   = useState<Submission[]>([])
  const [section,       setSection]       = useState<Section>('content')
  const [loading,       setLoading]       = useState(true)
  const [downloading,   setDownloading]   = useState(false)
  const [showEditions,  setShowEditions]  = useState(false)
  const [showUpload,    setShowUpload]    = useState(false)

  const submitters = Array.from(
    new Map(submissions.map(s => [s.submitted_by_id, s.submitted_by_name])).entries()
  ).map(([id, name]) => ({ id, name }))

  const loadEditions = useCallback(async () => {
    const { data } = await supabase.from('preassist_editions').select('*').order('created_at', { ascending: false })
    const all = (data ?? []) as Edition[]
    setEditions(all)
    const active = all.find(e => e.active) ?? null
    setActiveEdition(active)
    return active
  }, [])

  const loadSubmissions = useCallback(async (edition: Edition) => {
    setLoading(true)
    const { data } = await supabase
      .from('preassist_submissions').select('*')
      .eq('edition_id', edition.id).order('client_name').order('created_at', { ascending: false })

    const subs = (data ?? []) as Submission[]
    const withUrls = await Promise.all(subs.map(async s => {
      const { data: signed } = await supabase.storage.from('preassist').createSignedUrl(s.file_url, 3600)
      return { ...s, signedUrl: signed?.signedUrl }
    }))
    setSubmissions(withUrls)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadEditions().then(active => { if (active) loadSubmissions(active); else setLoading(false) })
  }, [loadEditions, loadSubmissions])

  async function handleDelete(id: string, filePath: string) {
    await supabase.storage.from('preassist').remove([filePath])
    await supabase.from('preassist_submissions').delete().eq('id', id)
    setSubmissions(prev => prev.filter(s => s.id !== id))
  }

  async function downloadZip(userId?: string) {
    if (!activeEdition) return
    setDownloading(true)

    const params = new URLSearchParams({ edition_id: activeEdition.id, section: 'all' })
    if (userId) params.set('user_id', userId)

    const res   = await fetch(`/api/preassist/signed-urls?${params}`)
    const files = await res.json() as { signedUrl: string | null; fileName: string; section: string; person: string; clientName: string | null }[]

    const zip = new JSZip()

    await Promise.all(
      files.filter(f => f.signedUrl).map(async f => {
        const blob        = await fetch(f.signedUrl!).then(r => r.blob())
        const sectionName = f.section === 'content' ? 'Content' : 'Inspiratie'
        const clientDir   = f.clientName ?? 'Algemeen'
        zip.folder(sectionName)!.folder(clientDir)!.file(`${f.person} — ${f.fileName}`, blob)
      })
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${activeEdition.title}${userId ? ` — ${files[0]?.person ?? ''}` : ''}.zip`
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  // Group filtered submissions by client
  const filtered = submissions.filter(s => s.section === section)
  const grouped  = filtered.reduce<Record<string, Submission[]>>((acc, s) => {
    const key = s.client_name ?? 'Algemeen'
    ;(acc[key] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 mb-6 text-sm text-zinc-500 hover:text-zinc-200 transition-colors">
        <ArrowLeft size={14} /> Terug
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Layers size={18} className="text-zinc-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-kurdis)' }}>
              Pré-assist
            </h1>
            {activeEdition && (
              <span className="text-sm font-medium px-2.5 py-0.5 rounded-full"
                style={{ background: 'rgba(58,145,63,0.15)', color: '#3A913F', border: '1px solid rgba(58,145,63,0.3)' }}>
                {activeEdition.title}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500">Dien content en inspiratie in voor de volgende sessie</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canManageEditions && (
            <button onClick={() => setShowEditions(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <Settings size={14} /> Edities
            </button>
          )}

          {activeEdition && submissions.length > 0 && (
            <div className="relative group">
              <button disabled={downloading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-zinc-300 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Downloaden <ChevronDown size={12} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl overflow-hidden shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20"
                style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)' }}>
                <button onClick={() => downloadZip()}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors text-left">
                  <Download size={13} /> Alles downloaden
                </button>
                {submitters.length > 0 && (
                  <>
                    <div className="mx-3 my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                    <p className="px-4 py-1.5 text-[10px] text-zinc-600 uppercase tracking-widest">Per persoon</p>
                    {submitters.map(s => (
                      <button key={s.id} onClick={() => downloadZip(s.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-left">
                        <Download size={12} /> {s.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {activeEdition && canAdd && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
              style={{ background: '#3A913F' }}>
              <Plus size={15} /> Toevoegen
            </button>
          )}
        </div>
      </div>

      {!activeEdition ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Layers size={32} className="text-zinc-700 mb-4" />
          <p className="text-zinc-400 font-medium mb-1">Geen actieve editie</p>
          {canManageEditions ? (
            <p className="text-sm text-zinc-600">Maak een editie aan via{' '}
              <button onClick={() => setShowEditions(true)} className="underline hover:text-zinc-400">Edities</button>.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">De beheerder heeft nog geen editie aangemaakt.</p>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-7 p-1 rounded-xl w-fit"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['content', 'inspiratie'] as Section[]).map(s => {
              const count = submissions.filter(sub => sub.section === s).length
              return (
                <button key={s} onClick={() => setSection(s)}
                  className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                  style={section === s ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: '#71717a' }}>
                  {s === 'content' ? 'Content' : 'Inspiratie'}
                  {count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: section === s ? 'rgba(58,145,63,0.3)' : 'rgba(255,255,255,0.08)', color: section === s ? '#4ade80' : '#52525b' }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-zinc-600">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Laden…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              {section === 'content' ? <ImageIcon size={28} className="text-zinc-700 mb-3" /> : <Layers size={28} className="text-zinc-700 mb-3" />}
              <p className="text-sm text-zinc-500 mb-1">Nog niets ingediend onder {section === 'content' ? 'Content' : 'Inspiratie'}.</p>
              <button onClick={() => setShowUpload(true)} className="mt-2 text-sm font-medium" style={{ color: '#3A913F' }}>
                + Eerste inzending toevoegen
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([clientName, subs]) => (
              <ClientGroup key={clientName} clientName={clientName} submissions={subs}
                currentUserId={currentUserId} isAdmin={isAdmin} canDeleteAll={canDeleteAll} onDelete={handleDelete} />
            ))
          )}
        </>
      )}

      {showUpload && activeEdition && (
        <UploadModal section={section} editionId={activeEdition.id}
          userId={currentUserId} userName={currentUserName}
          onClose={() => setShowUpload(false)} onUploaded={() => loadSubmissions(activeEdition)} />
      )}

      {showEditions && (
        <EditionModal editions={editions} onClose={() => setShowEditions(false)}
          onRefresh={() => loadEditions().then(a => { if (a) loadSubmissions(a) })} />
      )}
    </div>
  )
}
