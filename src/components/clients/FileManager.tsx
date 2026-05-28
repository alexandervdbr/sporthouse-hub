'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Folder, FolderOpen, ChevronRight, Home,
  Upload, Download, Trash2, Loader2, Search,
  Pencil, MoreVertical, X, Check, FolderPlus,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, File, FileCode, FileType2,
  AlertCircle, GripVertical,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToHtml(text: string) {
  return text.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')
}

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'xml', 'html', 'rtf', 'css', 'js', 'ts', 'yaml', 'yml', 'sh', 'sql'])

interface FolderRecord {
  id: string
  client_id: string
  name: string
  parent_id: string | null
  created_by: string | null
  created_at: string
}

interface FileRecord {
  id: string
  client_id: string
  filename: string
  description: string | null
  file_type: string
  file_size: number
  storage_path: string
  uploaded_by: string | null
  folder_id: string | null
  created_at: string
}

interface Breadcrumb {
  id: string | null
  name: string
}

interface Props {
  clientId: string
  currentUserEmail: string | null
}

function getFileIcon(fileType: string) {
  const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif']
  const videos = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v']
  const audio = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma']
  const archives = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  const code = ['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh', 'sql']
  const docs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf']
  const fonts = ['ttf', 'otf', 'woff', 'woff2', 'eot']
  const t = fileType.toLowerCase()
  if (images.includes(t)) return { icon: FileImage, color: 'text-blue-400', bg: 'bg-blue-950/50' }
  if (videos.includes(t)) return { icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-950/50' }
  if (audio.includes(t)) return { icon: FileAudio, color: 'text-pink-400', bg: 'bg-pink-950/50' }
  if (archives.includes(t)) return { icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-950/50' }
  if (code.includes(t)) return { icon: FileCode, color: 'text-emerald-400', bg: 'bg-emerald-950/50' }
  if (docs.includes(t)) return { icon: FileText, color: 'text-zinc-300', bg: 'bg-zinc-800' }
  if (fonts.includes(t)) return { icon: FileType2, color: 'text-cyan-400', bg: 'bg-cyan-950/50' }
  return { icon: File, color: 'text-zinc-400', bg: 'bg-zinc-800' }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeStorageName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
}

export default function FileManager({ clientId, currentUserEmail }: Props) {
  const isAdmin = ADMIN_EMAILS.includes(currentUserEmail ?? '')

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Bestanden' }])

  // Data
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [search, setSearch] = useState('')

  // Upload
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Folder create
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [createFolderError, setCreateFolderError] = useState<string | null>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)

  // Folder rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Folder context menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // File actions
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Inline text edit
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [wasRtf, setWasRtf] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none px-4 py-4 min-h-full',
      },
    },
  })

  // Set editor content whenever the loaded text changes (handles editor-not-ready timing)
  useEffect(() => {
    if (!editor || !editContent) return
    editor.commands.setContent(textToHtml(editContent))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContent, editor])

  // Global search across all folders
  const [globalResults, setGlobalResults] = useState<(FileRecord & { folder?: { id: string; name: string } | null })[]>([])
  const [globalLoading, setGlobalLoading] = useState(false)

  // Drag-and-drop: file → folder
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverRoot, setDragOverRoot] = useState(false) // for moving back to root

  const loadData = useCallback(async () => {
    setLoading(true)
    const fid = currentFolderId ?? 'null'
    const [foldersRes, filesRes] = await Promise.all([
      fetch(`/api/folders?clientId=${clientId}&parentId=${fid}`),
      fetch(`/api/files?clientId=${clientId}&folderId=${fid}`),
    ])
    if (foldersRes.ok) setFolders(await foldersRes.json())
    if (filesRes.ok) setFiles(await filesRes.json())
    setLoading(false)
  }, [clientId, currentFolderId])

  useEffect(() => { loadData() }, [loadData])

  // Global search: fires whenever the search query changes
  useEffect(() => {
    if (!search.trim()) { setGlobalResults([]); return }
    let cancelled = false
    setGlobalLoading(true)
    fetch(`/api/files?clientId=${clientId}&all=true`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) { setGlobalResults(data); setGlobalLoading(false) } })
      .catch(() => { if (!cancelled) setGlobalLoading(false) })
    return () => { cancelled = true }
  }, [search, clientId])

  function navigateInto(folder: FolderRecord) {
    setCurrentFolderId(folder.id)
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
    setMenuOpenId(null)
  }

  function navigateToBreadcrumb(crumb: Breadcrumb, idx: number) {
    if (idx === breadcrumbs.length - 1) return
    setCurrentFolderId(crumb.id)
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    setSearch('')
  }

  // ── Folder actions ──────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    setCreateFolderError(null)
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, name: newFolderName.trim(), parentId: currentFolderId }),
    })
    if (res.ok) {
      setNewFolderName('')
      setShowNewFolder(false)
      loadData()
    } else {
      const text = await res.text()
      setCreateFolderError(
        text.includes('file_folders') || text.includes('does not exist')
          ? 'Voer eerst de SQL uit in Supabase om mappen te activeren.'
          : `Fout: ${text}`
      )
    }
    setCreatingFolder(false)
  }

  async function handleRenameFolder(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    setRenamingId(null)
    loadData()
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm('Weet je zeker dat je deze map wilt verwijderen? Bestanden in de map worden niet verwijderd.')) return
    await fetch(`/api/folders/${id}`, { method: 'DELETE' })
    loadData()
  }

  // ── Drag file → folder ──────────────────────────────────────────────────────

  function onFileDragStart(e: React.DragEvent, fileId: string) {
    e.dataTransfer.setData('fileId', fileId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingFileId(fileId)
  }

  function onFileDragEnd() {
    setDraggingFileId(null)
    setDragOverFolderId(null)
    setDragOverRoot(false)
  }

  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  function onFolderDragLeave(e: React.DragEvent) {
    // Only clear if leaving the folder card entirely (not entering a child)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverFolderId(null)
    }
  }

  async function onDropOnFolder(e: React.DragEvent, targetFolderId: string) {
    e.preventDefault()
    const fileId = e.dataTransfer.getData('fileId')
    setDragOverFolderId(null)
    setDraggingFileId(null)
    if (!fileId) return
    await fetch(`/api/files?id=${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId }),
    })
    loadData()
  }

  // Drop on breadcrumb parent = move back to that folder level
  async function onDropOnBreadcrumb(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault()
    const fileId = e.dataTransfer.getData('fileId')
    setDragOverRoot(false)
    setDraggingFileId(null)
    if (!fileId) return
    await fetch(`/api/files?id=${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId }),
    })
    loadData()
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  function selectFile(file: File) {
    if (file.size > 100 * 1024 * 1024) { setUploadError('Bestand mag niet groter zijn dan 100 MB.'); return }
    setUploadError(null); setUploadSuccess(null); setPendingFile(file)
  }

  async function handleUpload() {
    if (!pendingFile) return
    setUploading(true); setUploadError(null); setUploadSuccess(null)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploadError('Niet ingelogd.'); setUploading(false); return }

    const ext = pendingFile.name.includes('.') ? pendingFile.name.split('.').pop()!.toLowerCase() : ''
    const safeName = safeStorageName(pendingFile.name)
    const storagePath = `${clientId}/${Date.now()}-${safeName}`
    const contentType = pendingFile.type || 'application/octet-stream'

    const { error: storErr } = await supabase.storage.from('files').upload(storagePath, pendingFile, { contentType })
    if (storErr) { setUploadError(`Upload mislukt: ${storErr.message}`); setUploading(false); return }

    const { error: dbErr } = await supabase.from('files').insert({
      client_id: clientId,
      filename: pendingFile.name,
      description: description.trim() || null,
      file_type: ext,
      file_size: pendingFile.size,
      storage_path: storagePath,
      uploaded_by: user.email,
      folder_id: currentFolderId,
    })

    if (dbErr) {
      await supabase.storage.from('files').remove([storagePath])
      setUploadError(`Database fout: ${dbErr.message}`); setUploading(false); return
    }

    setUploadSuccess(`"${pendingFile.name}" succesvol geüpload.`)
    setPendingFile(null); setDescription(''); loadData(); setUploading(false)
  }

  // ── Inline text edit ────────────────────────────────────────────────────────

  async function openEdit(file: FileRecord) {
    setLoadingEdit(true)
    setEditError(null)
    setEditContent('')
    editor?.commands.clearContent()
    setWasRtf(file.file_type.toLowerCase() === 'rtf')
    setEditingFile(file)
    try {
      const res = await fetch(`/api/files?id=${file.id}&mode=content`)
      if (!res.ok) throw new Error('Fout bij laden')
      const text = await res.text()
      setEditContent(text)
    } catch {
      setEditError('Kon bestandsinhoud niet laden.')
    }
    setLoadingEdit(false)
  }

  async function saveEdit() {
    if (!editingFile) return
    setSavingEdit(true)
    setEditError(null)
    const content = editor ? editor.getText({ blockSeparator: '\n' }) : editContent
    try {
      const res = await fetch(`/api/files?id=${editingFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        setEditError(error ?? 'Opslaan mislukt.')
        setSavingEdit(false)
        return
      }
      setFiles(prev => prev.map(f =>
        f.id === editingFile.id
          ? { ...f, file_size: new TextEncoder().encode(content).byteLength }
          : f
      ))
      setEditingFile(null)
      editor?.commands.clearContent()
    } catch {
      setEditError('Verbindingsfout.')
    }
    setSavingEdit(false)
  }

  // ── File actions ────────────────────────────────────────────────────────────

  async function handleDownload(file: FileRecord) {
    setDownloadingId(file.id)
    try {
      const res = await fetch(`/api/files?id=${file.id}`)
      const result = await res.json()
      if (!result.url) throw new Error('Geen URL')
      const blob = await (await fetch(result.url)).blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = result.filename
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { /* silent */ }
    setDownloadingId(null)
  }

  async function handleDeleteFile(fileId: string) {
    setDeletingId(fileId)
    await fetch(`/api/files?id=${fileId}`, { method: 'DELETE' })
    loadData(); setDeletingId(null)
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  const isGlobalSearch = search.trim().length > 0
  const q = search.toLowerCase()

  // Local folder view (no search)
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(q))
  const filteredFiles = files.filter(f =>
    f.filename.toLowerCase().includes(q) || (f.description?.toLowerCase().includes(q) ?? false)
  )

  // Global search results filtered client-side
  const filteredGlobal = globalResults.filter(f =>
    f.filename.toLowerCase().includes(q) || (f.description?.toLowerCase().includes(q) ?? false)
  )

  const hasResults = isGlobalSearch
    ? filteredGlobal.length > 0
    : filteredFolders.length > 0 || filteredFiles.length > 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Breadcrumbs — also act as drop targets when inside a subfolder */}
      <nav className="flex items-center gap-1 flex-wrap mb-6">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1
          const isDropTarget = draggingFileId && !isLast
          return (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-zinc-600" />}
              <button
                onClick={() => navigateToBreadcrumb(crumb, i)}
                disabled={isLast}
                onDragOver={isDropTarget ? (e) => { e.preventDefault(); setDragOverRoot(true) } : undefined}
                onDragLeave={isDropTarget ? () => setDragOverRoot(false) : undefined}
                onDrop={isDropTarget ? (e) => onDropOnBreadcrumb(e, crumb.id) : undefined}
                className={`flex items-center gap-1.5 text-sm px-1.5 py-0.5 rounded transition-colors ${
                  isLast
                    ? 'text-white font-semibold cursor-default'
                    : dragOverRoot
                      ? 'text-white bg-emerald-800/40 ring-1 ring-emerald-500'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {i === 0 && <Home size={13} />}
                {crumb.name}
              </button>
            </span>
          )
        })}

        {/* Hint when dragging */}
        {draggingFileId && breadcrumbs.length > 1 && (
          <span className="text-xs text-zinc-500 ml-2 italic">Sleep naar een broodkruimel om te verplaatsen</span>
        )}
      </nav>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Zoeken in deze map..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
        <button
          onClick={() => {
            setShowNewFolder(true)
            setCreateFolderError(null)
            setTimeout(() => newFolderRef.current?.focus(), 50)
          }}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-white rounded-lg transition-colors flex-shrink-0"
        >
          <FolderPlus size={14} />
          Nieuwe map
        </button>
      </div>

      {/* Inline new-folder input */}
      {showNewFolder && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2 p-3 bg-zinc-900/60 border border-zinc-700 rounded-xl">
            <FolderPlus size={16} className="text-amber-400 flex-shrink-0" />
            <input
              ref={newFolderRef}
              type="text"
              placeholder="Naam van de map..."
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); setCreateFolderError(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); setCreateFolderError(null) }
              }}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
            />
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              className="p-1.5 rounded-md text-emerald-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {creatingFolder ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); setCreateFolderError(null) }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          {createFolderError && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{createFolderError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Global search results ── */}
      {isGlobalSearch && (
        <div className="mb-6">
          {globalLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-zinc-600" />
            </div>
          ) : filteredGlobal.length === 0 ? (
            <p className="text-sm text-zinc-500 py-12 text-center">
              Geen bestanden gevonden voor &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-3">
                {filteredGlobal.length} {filteredGlobal.length === 1 ? 'resultaat' : 'resultaten'} in alle mappen
              </p>
              <div className="space-y-1.5">
                {filteredGlobal.map((file) => {
                  const { icon: Icon, color, bg } = getFileIcon(file.file_type)
                  const canDelete = isAdmin || file.uploaded_by === currentUserEmail
                  const canEdit = isAdmin || file.uploaded_by === currentUserEmail
                  const isText = TEXT_EXTENSIONS.has(file.file_type.toLowerCase())
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={15} className={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{file.filename}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {/* Folder badge */}
                          <span className="flex items-center gap-1 text-xs text-zinc-500 flex-shrink-0">
                            <Folder size={10} className="text-amber-500" />
                            {file.folder ? file.folder.name : 'Hoofdmap'}
                          </span>
                          {(file.description || true) && <span className="text-zinc-700">·</span>}
                          <p className="text-xs text-zinc-600 flex-shrink-0 truncate">
                            {formatSize(file.file_size)} · {file.file_type.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isText && canEdit && (
                          <button
                            onClick={() => openEdit(file)}
                            title="Bewerken"
                            className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(file)}
                          disabled={downloadingId === file.id}
                          title="Download"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                          {downloadingId === file.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Download size={13} />}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            disabled={deletingId === file.id}
                            title="Verwijderen"
                            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                          >
                            {deletingId === file.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {!isGlobalSearch && loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      ) : !isGlobalSearch && (
        <>
          {/* Folder grid */}
          {filteredFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
              {filteredFolders.map((folder) => {
                const isOver = dragOverFolderId === folder.id
                return (
                  <div key={folder.id} className="relative group">
                    {renamingId === folder.id ? (
                      /* Inline rename */
                      <div className="flex items-center gap-1.5 p-3 bg-zinc-900 border border-zinc-600 rounded-xl">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder(folder.id)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="flex-1 bg-transparent text-xs text-white outline-none min-w-0"
                        />
                        <button onClick={() => handleRenameFolder(folder.id)} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
                          <Check size={11} />
                        </button>
                        <button onClick={() => setRenamingId(null)} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      /* Folder card — click to navigate, drag-over to receive files */
                      <button
                        onClick={() => navigateInto(folder)}
                        onDragOver={(e) => onFolderDragOver(e, folder.id)}
                        onDragLeave={onFolderDragLeave}
                        onDrop={(e) => onDropOnFolder(e, folder.id)}
                        className={`w-full flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all text-center border-2 ${
                          isOver
                            ? 'border-emerald-500 bg-emerald-950/30 scale-105'
                            : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/60'
                        }`}
                      >
                        {isOver
                          ? <FolderOpen size={36} className="text-emerald-400" />
                          : <Folder size={36} className="text-amber-400" />
                        }
                        <span className="text-xs text-white font-medium leading-snug line-clamp-2 w-full">
                          {folder.name}
                        </span>
                        {isOver && (
                          <span className="text-xs text-emerald-400">Loslaten om te verplaatsen</span>
                        )}
                      </button>
                    )}

                    {/* 3-dot menu */}
                    {renamingId !== folder.id && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === folder.id ? null : folder.id)
                          }}
                          className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all"
                        >
                          <MoreVertical size={12} />
                        </button>
                        {menuOpenId === folder.id && (
                          <div className="absolute right-0 top-7 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl min-w-36 py-1 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRenamingId(folder.id)
                                setRenameValue(folder.name)
                                setMenuOpenId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                            >
                              <Pencil size={11} /> Hernoemen
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setMenuOpenId(null)
                                handleDeleteFolder(folder.id)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-zinc-700 transition-colors"
                            >
                              <Trash2 size={11} /> Verwijderen
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Divider */}
          {filteredFolders.length > 0 && filteredFiles.length > 0 && (
            <div className="border-t border-zinc-800/60 mb-4" />
          )}

          {/* Files list — draggable */}
          {filteredFiles.length > 0 && (
            <div className="space-y-1.5 mb-6">
              {filteredFiles.map((file) => {
                const { icon: Icon, color, bg } = getFileIcon(file.file_type)
                const canDelete = isAdmin || file.uploaded_by === currentUserEmail
                const canEdit = isAdmin || file.uploaded_by === currentUserEmail
                const isText = TEXT_EXTENSIONS.has(file.file_type.toLowerCase())
                const isDraggingThis = draggingFileId === file.id
                return (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={(e) => onFileDragStart(e, file.id)}
                    onDragEnd={onFileDragEnd}
                    className={`flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-all cursor-grab active:cursor-grabbing ${
                      isDraggingThis ? 'opacity-40 scale-95' : ''
                    }`}
                  >
                    {/* Drag handle hint */}
                    <GripVertical size={13} className="text-zinc-700 group-hover:text-zinc-500 flex-shrink-0 transition-colors" />

                    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={15} className={color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{file.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {file.description && (
                          <p className="text-xs text-zinc-400 truncate">{file.description}</p>
                        )}
                        {file.description && <span className="text-zinc-700">·</span>}
                        <p className="text-xs text-zinc-600 flex-shrink-0">
                          {formatSize(file.file_size)}
                          {' · '}
                          {file.file_type.toUpperCase()}
                          {' · '}
                          {new Date(file.created_at).toLocaleDateString('nl-BE', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isText && canEdit && (
                        <button
                          onClick={() => openEdit(file)}
                          title="Bewerken"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={downloadingId === file.id}
                        title="Download"
                        className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                      >
                        {downloadingId === file.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Download size={13} />}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          disabled={deletingId === file.id}
                          title="Verwijderen"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                        >
                          {deletingId === file.id
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

          {/* Empty state — only shown in folder view, not search (search has its own) */}
          {!hasResults && (
            <div className="py-16 text-center">
              <FolderOpen size={36} className="text-zinc-700 mx-auto" />
              <p className="text-sm text-zinc-500 mt-3">Deze map is leeg.</p>
              <p className="text-xs text-zinc-600">Upload een bestand of maak een nieuwe map aan.</p>
            </div>
          )}
        </>
      )}

      {/* ── Upload zone ── */}
      <div className="mt-6 pt-6 border-t border-zinc-800 space-y-3">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
          Uploaden{breadcrumbs.length > 1 ? ` in "${breadcrumbs[breadcrumbs.length - 1].name}"` : ''}
        </p>

        <div
          onClick={() => !pendingFile && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!draggingFileId) setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setIsDragging(false)
            // Only handle real file drops (from OS), not internal file-to-folder drags
            if (draggingFileId) return
            const f = e.dataTransfer.files[0]; if (f) selectFile(f)
          }}
          className={`
            border-2 border-dashed rounded-xl p-5 text-center transition-all
            ${pendingFile ? 'border-zinc-700 bg-zinc-900/30' : 'cursor-pointer'}
            ${isDragging
              ? 'border-zinc-500 bg-zinc-800/50'
              : !pendingFile ? 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50' : ''}
          `}
        >
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); e.target.value = '' }}
            className="hidden"
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
                onClick={(e) => { e.stopPropagation(); setPendingFile(null); setDescription('') }}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 transition-colors"
              >
                Wijzig
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
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: '#3A913F' }}
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" /> Uploaden...</>
                : <><Upload size={14} /> Uploaden</>}
            </button>
          </div>
        )}

        {uploadError && (
          <div className="px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg">
            <p className="text-sm text-red-400">{uploadError}</p>
          </div>
        )}
        {uploadSuccess && (
          <div className="px-4 py-3 bg-emerald-950/50 border border-emerald-900/50 rounded-lg">
            <p className="text-sm text-emerald-400">{uploadSuccess}</p>
          </div>
        )}
      </div>

      {/* Backdrop to close menus */}
      {menuOpenId && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpenId(null)} />
      )}

      {/* ── Inline text edit modal ── */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-6xl flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(18,18,18,0.98)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              height: '90vh',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <Pencil size={15} className="text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{editingFile.filename}</p>
                {wasRtf && (
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    RTF-opmaak verwijderd — opgeslagen als platte tekst
                  </p>
                )}
              </div>
              <button
                onClick={() => { setEditingFile(null); editor?.commands.clearContent() }}
                className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3 min-h-0">
              {loadingEdit ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-zinc-500" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl min-h-0 cursor-text [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:text-zinc-200 [&_.ProseMirror]:text-sm [&_.ProseMirror_p]:my-1 [&_.ProseMirror_p:empty]:min-h-[1.4em] focus-within:border-zinc-600 transition-colors">
                  <EditorContent editor={editor} />
                </div>
              )}
              {editError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-950/50 border border-red-900/50 rounded-lg flex-shrink-0">
                  <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400">{editError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800 flex-shrink-0">
              <button
                onClick={() => { setEditingFile(null); editor?.commands.clearContent() }}
                disabled={savingEdit}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit || loadingEdit}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: '#2563eb' }}
              >
                {savingEdit
                  ? <><Loader2 size={13} className="animate-spin" /> Opslaan...</>
                  : <><Check size={13} /> Opslaan</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
