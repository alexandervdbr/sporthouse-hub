'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Download, Trash2, Loader2, Search,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode, FileType2, File as FileIcon,
  AlertCircle, X, Pencil, Save,
} from 'lucide-react'

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'])

interface Document {
  id: string
  filename: string
  description: string | null
  file_type: string
  file_size: number
  uploaded_by: string | null
  created_at: string
}

interface Props {
  section: 'finance' | 'administration'
  canManage: boolean
  currentUserEmail: string | null
}

function getFileIcon(fileType: string) {
  const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'avif']
  const videos = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv']
  const audio = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a']
  const archives = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  const code = ['js', 'ts', 'py', 'html', 'css', 'json', 'xml', 'sql']
  const fonts = ['ttf', 'otf', 'woff', 'woff2']
  const t = fileType.toLowerCase()
  if (images.includes(t)) return { icon: FileImage, color: 'text-blue-400', bg: 'bg-blue-950/50' }
  if (videos.includes(t)) return { icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-950/50' }
  if (audio.includes(t)) return { icon: FileAudio, color: 'text-pink-400', bg: 'bg-pink-950/50' }
  if (archives.includes(t)) return { icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-950/50' }
  if (code.includes(t)) return { icon: FileCode, color: 'text-emerald-400', bg: 'bg-emerald-950/50' }
  if (fonts.includes(t)) return { icon: FileType2, color: 'text-cyan-400', bg: 'bg-cyan-950/50' }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(t)) {
    return { icon: FileText, color: 'text-zinc-300', bg: 'bg-zinc-800' }
  }
  return { icon: FileIcon, color: 'text-zinc-400', bg: 'bg-zinc-800' }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentManager({ section, canManage, currentUserEmail }: Props) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [editingDoc,   setEditingDoc]   = useState<Document | null>(null)
  const [editContent,  setEditContent]  = useState('')
  const [loadingEdit,  setLoadingEdit]  = useState(false)
  const [savingEdit,   setSavingEdit]   = useState(false)
  const [editError,    setEditError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/sporthouse/documents?section=${section}`)
    if (res.ok) setDocs(await res.json())
    setLoading(false)
  }, [section])

  useEffect(() => { load() }, [load])

  function selectFile(file: File) {
    if (file.size > 100 * 1024 * 1024) {
      setUploadError('Bestand mag niet groter zijn dan 100 MB.')
      return
    }
    setUploadError(null)
    setUploadSuccess(null)
    setPendingFile(file)
  }

  async function handleUpload() {
    if (!pendingFile) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    const fd = new FormData()
    fd.append('section', section)
    fd.append('file', pendingFile)
    if (description.trim()) fd.append('description', description.trim())

    const res = await fetch('/api/sporthouse/documents', { method: 'POST', body: fd })
    if (res.ok) {
      setUploadSuccess(`"${pendingFile.name}" succesvol geüpload.`)
      setPendingFile(null)
      setDescription('')
      load()
    } else {
      const text = await res.text()
      setUploadError(`Upload mislukt: ${text}`)
    }
    setUploading(false)
  }

  async function handleDownload(doc: Document) {
    setDownloadingId(doc.id)
    try {
      const res = await fetch(`/api/sporthouse/documents/${doc.id}`)
      if (!res.ok) throw new Error()
      const { url, filename } = await res.json()
      const blob = await (await fetch(url)).blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // silent
    }
    setDownloadingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Document verwijderen?')) return
    setDeletingId(id)
    await fetch(`/api/sporthouse/documents/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
    setDeletingId(null)
  }

  async function openEdit(doc: Document) {
    setEditingDoc(doc)
    setEditError(null)
    setLoadingEdit(true)
    try {
      const res = await fetch(`/api/sporthouse/documents/${doc.id}`)
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      const text = await (await fetch(url)).text()
      setEditContent(text)
    } catch {
      setEditError('Kon bestand niet laden.')
    }
    setLoadingEdit(false)
  }

  async function saveEdit() {
    if (!editingDoc) return
    setSavingEdit(true)
    setEditError(null)
    const res = await fetch(`/api/sporthouse/documents/${editingDoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    if (res.ok) {
      setDocs(prev => prev.map(d =>
        d.id === editingDoc.id
          ? { ...d, file_size: new TextEncoder().encode(editContent).byteLength }
          : d
      ))
      setEditingDoc(null)
    } else {
      setEditError('Opslaan mislukt. Probeer opnieuw.')
    }
    setSavingEdit(false)
  }

  const q = search.toLowerCase()
  const filtered = docs.filter(d =>
    d.filename.toLowerCase().includes(q) || (d.description?.toLowerCase().includes(q) ?? false)
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Zoeken..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {search ? `Geen documenten gevonden voor "${search}".` : 'Nog geen documenten geüpload.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 mb-8">
          {filtered.map(doc => {
            const { icon: Icon, color, bg } = getFileIcon(doc.file_type)
            const canDelete = canManage || doc.uploaded_by === currentUserEmail
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={15} className={color} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.description && (
                      <p className="text-xs text-zinc-400 truncate">{doc.description}</p>
                    )}
                    {doc.description && <span className="text-zinc-700">·</span>}
                    <p className="text-xs text-zinc-600 flex-shrink-0">
                      {formatSize(doc.file_size)}
                      {' · '}
                      {doc.file_type.toUpperCase()}
                      {' · '}
                      {new Date(doc.created_at).toLocaleDateString('nl-BE', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {TEXT_EXTENSIONS.has(doc.file_type.toLowerCase()) && (canManage || doc.uploaded_by === currentUserEmail) && (
                    <button
                      onClick={() => openEdit(doc)}
                      title="Bewerken"
                      className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    title="Download"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    {downloadingId === doc.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      title="Verwijderen"
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                    >
                      {deletingId === doc.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload zone — only for users who can manage */}
      {canManage && (
        <div className="pt-6 border-t border-zinc-800 space-y-3">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Document uploaden</p>

          <div
            onClick={() => !pendingFile && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!pendingFile) setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault(); setIsDragging(false)
              const f = e.dataTransfer.files[0]; if (f) selectFile(f)
            }}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
              pendingFile ? 'border-zinc-700 bg-zinc-900/30' : 'cursor-pointer'
            } ${
              isDragging
                ? 'border-zinc-500 bg-zinc-800/50'
                : !pendingFile ? 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50' : ''
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); e.target.value = '' }}
            />
            {pendingFile ? (
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <Upload size={15} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{pendingFile.name}</p>
                  <p className="text-xs text-zinc-500">{formatSize(pendingFile.size)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setPendingFile(null); setDescription('') }}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={18} className="text-zinc-500" />
                <p className="text-sm text-zinc-400">Sleep een bestand of klik om te uploaden</p>
                <p className="text-xs text-zinc-600">Alle bestandstypen — max 100 MB</p>
              </div>
            )}
          </div>

          {pendingFile && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Beschrijving (optioneel)..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#3A913F' }}
              >
                {uploading
                  ? <><Loader2 size={14} className="animate-spin" /> Uploaden...</>
                  : <><Upload size={14} /> Uploaden</>}
              </button>
            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{uploadError}</p>
            </div>
          )}
          {uploadSuccess && (
            <div className="px-4 py-3 bg-emerald-950/50 border border-emerald-900/50 rounded-lg">
              <p className="text-sm text-emerald-400">{uploadSuccess}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Edit modal ── */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !savingEdit && setEditingDoc(null)} />
          <div className="relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh]">

            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <Pencil size={14} className="text-blue-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-zinc-100 truncate">{editingDoc.filename}</p>
                <span className="text-xs text-zinc-600 flex-shrink-0">{editingDoc.file_type.toUpperCase()}</span>
              </div>
              <button onClick={() => setEditingDoc(null)} disabled={savingEdit}
                className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-3">
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 p-4">
              {loadingEdit ? (
                <div className="flex items-center justify-center h-48 gap-2 text-zinc-600">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Laden…</span>
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full min-h-[400px] resize-none bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-zinc-600 transition-colors"
                  style={{ tabSize: 2 }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-zinc-800">
              <div className="text-xs text-zinc-600">
                {editContent.split('\n').length} regels · {editContent.length} tekens
              </div>
              <div className="flex items-center gap-2">
                {editError && (
                  <span className="text-xs text-red-400">{editError}</span>
                )}
                <button onClick={() => setEditingDoc(null)} disabled={savingEdit}
                  className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Annuleren
                </button>
                <button onClick={saveEdit} disabled={savingEdit || loadingEdit}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: '#3A913F' }}>
                  {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {savingEdit ? 'Opslaan…' : 'Opslaan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
