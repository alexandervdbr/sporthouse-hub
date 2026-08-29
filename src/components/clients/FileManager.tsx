'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Folder, FolderOpen, ChevronRight, Home,
  Upload, Download, Trash2, Loader2, Search,
  Pencil, MoreVertical, X, Check, FolderPlus,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, File, FileCode, FileType2,
  AlertCircle, GripVertical, ArrowUpDown,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import JSZip from 'jszip'
import { FileRecord } from '@/types/database'
import { DriveThumbnail, DrivePreviewModal } from '@/components/shared/DrivePreview'
import { ALLOWED_UPLOAD_HINT } from '@/lib/upload-policy'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToHtml(text: string) {
  return text.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')
}

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'json', 'xml', 'html', 'rtf', 'css', 'js', 'ts', 'yaml', 'yml', 'sh', 'sql'])

interface FolderRecord {
  id: string
  client_id: string
  name: string
  parent_id: string | null
  created_by: string | null
  created_at: string
}

interface Breadcrumb {
  id: string | null
  name: string
}

// Describes which backend this manager talks to. Both backends expose the same
// REST contract; only the paths, the scope parameter and a couple of labels
// differ, so the entire UI below is shared verbatim between client files and
// the Sporthouse Intern documents (Financiën/Administratie).
export interface FileManagerBackend {
  filesApi: string   // e.g. '/api/files' — also hosts /download, /restore, /purge, /upload-session, /finalize
  foldersApi: string // e.g. '/api/folders'
  scopeKey: string   // 'clientId' | 'section'
  scopeValue: string // a client uuid, or 'finance' | 'administration'
  rootLabel: string  // breadcrumb label for the root folder
}

interface Props {
  backend: FileManagerBackend
  currentUserEmail: string | null
  isAdmin: boolean
  canDeleteFiles: boolean
  // Hides every mutating control (upload, new folder, rename/delete folder).
  // Client files leave this on for any logged-in user; the Sporthouse Intern
  // sections pass the section's *_beheren permission, so a view-only user
  // isn't shown buttons the API would refuse anyway.
  canManage?: boolean
}

interface PendingEntry {
  file: File
  relativePath: string // folder/sub/file.ext for a folder upload, just file.ext otherwise
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number // 0-100, only meaningful while status === 'uploading'
  error?: string
}

// Recursively reads a dropped directory entry (Chrome/Edge/Safari cap each
// readEntries() call at ~100 results, so it has to be called in a loop).
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    all.push(...batch)
  }
  return all
}

async function walkEntry(entry: FileSystemEntry, path: string, out: PendingEntry[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, relativePath: path + file.name, status: 'pending', progress: 0 })
  } else if (entry.isDirectory) {
    const entries = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    for (const child of entries) {
      await walkEntry(child, `${path}${entry.name}/`, out)
    }
  }
}

// Drag-and-drop of a folder needs the File System Entries API to recover
// structure — DataTransfer.files alone doesn't carry subfolder paths (or, in
// some browsers, even include a dropped folder's contents at all).
async function collectDroppedEntries(dataTransfer: DataTransfer): Promise<PendingEntry[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items.map(item => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)

  if (!entries.length) {
    return Array.from(dataTransfer.files).map(file => ({ file, relativePath: file.name, status: 'pending' as const, progress: 0 }))
  }

  const out: PendingEntry[] = []
  for (const entry of entries) await walkEntry(entry, '', out)
  return out
}

// Drive's resumable upload requires chunk sizes to be a multiple of 256 KiB
// (except the final chunk) — 8 MiB keeps any single request short-lived, so
// a network blip only ever costs one chunk instead of the whole file.
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

// Sends one Content-Range chunk through our own upload-relay route (same
// origin — Drive's upload endpoint doesn't return CORS headers, so a direct
// browser-to-Google PUT always fails to be readable, confirmed via a HAR
// capture showing status 200 + net::ERR_FAILED on every request). The relay
// forwards to the Drive session URL server-to-server and mirrors its
// response back to us, so everything below still reads like talking to Drive
// directly. Resolves { done: true, driveFileId } once Drive confirms the
// file is complete (final chunk), or { done: false } if more are expected.
// The relay itself is backend-agnostic — it only forwards bytes to whichever
// Drive session URL it's handed — so both backends share this one route.
function putChunk(uploadUrl: string, file: File, start: number, end: number): Promise<{ done: boolean; driveFileId?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', '/api/files/upload-relay')
    xhr.setRequestHeader('X-Upload-Url', uploadUrl)
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`)
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (!data.id) throw new Error('missing id')
          resolve({ done: true, driveFileId: data.id as string })
        } catch {
          reject(new Error('Ongeldig antwoord van Drive.'))
        }
      } else if (xhr.status === 308) {
        resolve({ done: false })
      } else {
        reject(new Error(`Upload naar Drive mislukt (${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new Error('NETWORK_ERROR'))
    xhr.send(file.slice(start, end))
  })
}

// Asks Drive (via the same relay) how many bytes of this session it actually
// has, instead of assuming a dropped connection means the chunk was lost —
// recovers the real position (or the fact that the file already completed)
// so we can resume from there rather than restarting the whole upload.
function queryUploadStatus(uploadUrl: string, fileSize: number): Promise<{ done: boolean; driveFileId?: string; receivedBytes: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', '/api/files/upload-relay')
    xhr.setRequestHeader('X-Upload-Url', uploadUrl)
    xhr.setRequestHeader('Content-Range', `bytes */${fileSize}`)
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (!data.id) throw new Error('missing id')
          resolve({ done: true, driveFileId: data.id as string, receivedBytes: fileSize })
        } catch {
          reject(new Error('Ongeldig antwoord van Drive.'))
        }
      } else if (xhr.status === 308) {
        const range = xhr.getResponseHeader('Range') // e.g. "bytes=0-1048575", absent if nothing received yet
        const receivedBytes = range ? parseInt(range.split('-')[1], 10) + 1 : 0
        resolve({ done: false, receivedBytes })
      } else {
        reject(new Error(`Kon upload-status niet controleren (${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new Error('Netwerkfout tijdens statuscontrole.'))
    xhr.send()
  })
}

// PUTs a file straight to a Drive resumable-upload session URL (bypassing our
// own server for the bytes), in chunks, recovering from a dropped connection
// by asking Drive for the real byte offset instead of restarting from 0.
async function putFileToDrive(file: File, uploadUrl: string, onProgress: (pct: number) => void): Promise<string> {
  let offset = 0
  let consecutiveFailures = 0
  const MAX_CONSECUTIVE_FAILURES = 5

  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, file.size)
    try {
      const result = await putChunk(uploadUrl, file, offset, end)
      if (result.done && result.driveFileId) return result.driveFileId
      offset = end
      consecutiveFailures = 0
      onProgress(Math.round((offset / file.size) * 100))
    } catch {
      consecutiveFailures++
      if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
        throw new Error('Upload mislukt na meerdere pogingen.')
      }
      await new Promise(r => setTimeout(r, 1000 * consecutiveFailures))
      try {
        const status = await queryUploadStatus(uploadUrl, file.size)
        if (status.done && status.driveFileId) return status.driveFileId
        offset = status.receivedBytes
        onProgress(Math.round((offset / file.size) * 100))
      } catch {
        // Status check itself failed too — just retry the same chunk on the next loop pass.
      }
    }
  }

  throw new Error('Upload onverwacht niet voltooid.')
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif']
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v']
const AUDIO_EXTS = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma']
const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
const CODE_EXTS = ['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh', 'sql']
const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf']
const FONT_EXTS = ['ttf', 'otf', 'woff', 'woff2', 'eot']

function getFileIcon(fileType: string) {
  const t = fileType.toLowerCase()
  if (IMAGE_EXTS.includes(t)) return { icon: FileImage, color: 'text-blue-400', bg: 'bg-blue-950/50' }
  if (VIDEO_EXTS.includes(t)) return { icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-950/50' }
  if (AUDIO_EXTS.includes(t)) return { icon: FileAudio, color: 'text-pink-400', bg: 'bg-pink-950/50' }
  if (ARCHIVE_EXTS.includes(t)) return { icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-950/50' }
  if (CODE_EXTS.includes(t)) return { icon: FileCode, color: 'text-emerald-400', bg: 'bg-emerald-950/50' }
  if (DOC_EXTS.includes(t)) return { icon: FileText, color: 'text-zinc-300', bg: 'bg-zinc-800' }
  if (FONT_EXTS.includes(t)) return { icon: FileType2, color: 'text-cyan-400', bg: 'bg-cyan-950/50' }
  return { icon: File, color: 'text-zinc-400', bg: 'bg-zinc-800' }
}

type TypeFilter = 'all' | 'image' | 'video' | 'document' | 'other'

function getFileCategory(fileType: string): TypeFilter {
  const t = fileType.toLowerCase()
  if (IMAGE_EXTS.includes(t)) return 'image'
  if (VIDEO_EXTS.includes(t)) return 'video'
  if (DOC_EXTS.includes(t)) return 'document'
  return 'other'
}

type SortKey = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc'

function sortFileRecords<T extends { filename: string; created_at: string; file_size: number }>(list: T[], sortKey: SortKey): T[] {
  const sorted = [...list]
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'name-asc': return a.filename.localeCompare(b.filename)
      case 'name-desc': return b.filename.localeCompare(a.filename)
      case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'size-asc': return a.file_size - b.file_size
      case 'size-desc': return b.file_size - a.file_size
      default: return 0
    }
  })
  return sorted
}

// Small custom checkbox matching the app's dark zinc + emerald accent language,
// used instead of the browser's native checkbox for file/row selection.
function SelectCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      aria-label={checked ? 'Deselecteren' : 'Selecteren'}
      className={`w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0 border transition-colors ${
        checked ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-900 border-zinc-600 hover:border-zinc-500'
      }`}
    >
      {checked && <Check size={10} className="text-white" strokeWidth={3} />}
    </button>
  )
}

// Real image/video preview when Drive has generated one, falling back to the
// generic file-type icon otherwise (non-Drive rows, or a thumbnail Drive
// hasn't produced yet for this file type).
function FileTile({ file, icon: Icon, color }: { file: FileRecord; icon: typeof File; color: string }) {
  if (file.storage_provider === 'drive' && file.thumbnail_link) {
    return <DriveThumbnail src={file.thumbnail_link} alt={file.filename} video={getFileCategory(file.file_type) === 'video'} />
  }
  return <Icon size={15} className={color} />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileManager({ backend, currentUserEmail, isAdmin, canDeleteFiles, canManage = true }: Props) {
  const { filesApi, foldersApi, scopeKey, scopeValue, rootLabel } = backend
  // `clientId=<uuid>` or `section=finance` — appended to every scoped request.
  const scopeQuery = `${scopeKey}=${encodeURIComponent(scopeValue)}`
  // Namespaces the remembered breadcrumb trail per tab, so Financiën,
  // Administratie and each client's files don't restore each other's folder.
  const scopeStorageKey = `${filesApi}:${scopeValue}`

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: rootLabel }])

  // Restore the last-visited folder for this client after a reload, instead
  // of always dropping back to the root. Done in an effect (not a lazy
  // useState initializer) so the server-rendered/initial-client render still
  // matches and only corrects itself right after mount, avoiding a hydration
  // mismatch.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`files-breadcrumbs-${scopeStorageKey}`)
      if (!raw) return
      const saved: Breadcrumb[] = JSON.parse(raw)
      if (Array.isArray(saved) && saved.length > 0) {
        // Self-heal: collapse any duplicate folder ids a previously-corrupted
        // trail might contain, so a stale saved value can never reproduce the
        // "two children with the same key" crash on restore.
        const deduped = saved.filter((b, i) => saved.findIndex(x => x.id === b.id) === i)
        setBreadcrumbs(deduped)
        setCurrentFolderId(deduped[deduped.length - 1].id)
      }
    } catch { /* ignore malformed/unavailable storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeStorageKey])

  useEffect(() => {
    try {
      sessionStorage.setItem(`files-breadcrumbs-${scopeStorageKey}`, JSON.stringify(breadcrumbs))
    } catch { /* ignore, e.g. private-browsing storage restrictions */ }
  }, [breadcrumbs, scopeStorageKey])

  // Data
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [search, setSearch] = useState('')

  // Sort/filter
  const [sortKey, setSortKey] = useState<SortKey>('date-desc')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Marquee (rubber-band) selection
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const fileRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const folderCardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null)
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const [previewFolderIds, setPreviewFolderIds] = useState<Set<string>>(new Set())
  const previewIdsRef = useRef<Set<string>>(new Set())
  const previewFolderIdsRef = useRef<Set<string>>(new Set())

  // Folder selection (download only, not delete)
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)

  // Upload
  const [isDragging, setIsDragging] = useState(false)
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([])
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Folder create
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [createFolderError, setCreateFolderError] = useState<string | null>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)

  // Folder rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Folder delete confirmation (delete contents vs. move them up)
  const [folderToDelete, setFolderToDelete] = useState<FolderRecord | null>(null)
  const [folderDeleteContentsCount, setFolderDeleteContentsCount] = useState<number | null>(null)
  const [deletingFolderBusy, setDeletingFolderBusy] = useState(false)

  // Folder context menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // File actions
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null)
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Prullenbak (trash)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedFiles, setTrashedFiles] = useState<FileRecord[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [purgingId, setPurgingId] = useState<string | null>(null)

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
      fetch(`${foldersApi}?${scopeQuery}&parentId=${fid}`),
      fetch(`${filesApi}?${scopeQuery}&folderId=${fid}`),
    ])
    if (foldersRes.ok) setFolders(await foldersRes.json())
    if (filesRes.ok) setFiles(await filesRes.json())
    setLoading(false)
  }, [foldersApi, filesApi, scopeQuery, currentFolderId])

  useEffect(() => { loadData() }, [loadData])

  // webkitdirectory/directory aren't part of React's typed input attributes —
  // set them directly so the folder-select button can pick a whole folder.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
  }, [])

  const loadTrash = useCallback(async () => {
    setTrashLoading(true)
    const res = await fetch(`${filesApi}?${scopeQuery}&trashed=true`)
    if (res.ok) setTrashedFiles(await res.json())
    setTrashLoading(false)
  }, [filesApi, scopeQuery])

  useEffect(() => { if (showTrash) loadTrash() }, [showTrash, loadTrash])

  // Global search: fires whenever the search query changes
  useEffect(() => {
    if (!search.trim()) { setGlobalResults([]); return }
    let cancelled = false
    setGlobalLoading(true)
    fetch(`${filesApi}?${scopeQuery}&all=true`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) { setGlobalResults(data); setGlobalLoading(false) } })
      .catch(() => { if (!cancelled) setGlobalLoading(false) })
    return () => { cancelled = true }
  }, [search, filesApi, scopeQuery])

  function navigateInto(folder: FolderRecord) {
    setCurrentFolderId(folder.id)
    // A folder's id should never legitimately reappear in its own breadcrumb
    // trail — guard against it regardless of cause, since that's exactly
    // what produces React's "two children with the same key" crash.
    setBreadcrumbs(prev => prev.some(b => b.id === folder.id) ? prev : [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
    setMenuOpenId(null)
    setSelectedIds(new Set())
    setSelectedFolderIds(new Set())
  }

  function navigateToBreadcrumb(crumb: Breadcrumb, idx: number) {
    if (idx === breadcrumbs.length - 1) return
    setCurrentFolderId(crumb.id)
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    setSearch('')
    setSelectedIds(new Set())
    setSelectedFolderIds(new Set())
  }

  // ── Folder actions ──────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    setCreateFolderError(null)
    const res = await fetch(foldersApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [scopeKey]: scopeValue, name: newFolderName.trim(), parentId: currentFolderId }),
    })
    if (res.ok) {
      setNewFolderName('')
      setShowNewFolder(false)
      loadData()
    } else {
      const text = await res.text()
      setCreateFolderError(
        text.includes('file_folders') || text.includes('sporthouse_document_folders') || text.includes('does not exist')
          ? 'Voer eerst de SQL uit in Supabase om mappen te activeren.'
          : `Fout: ${text}`
      )
    }
    setCreatingFolder(false)
  }

  async function handleRenameFolder(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    await fetch(`${foldersApi}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    setRenamingId(null)
    loadData()
  }

  function openDeleteFolderConfirm(folder: FolderRecord) {
    setFolderToDelete(folder)
    setFolderDeleteContentsCount(null)
    fetch(`${foldersApi}/${folder.id}/contents`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { files: unknown[] } | null) => { if (data) setFolderDeleteContentsCount(data.files.length) })
      .catch(() => {})
  }

  async function performFolderDelete(mode: 'delete' | 'move') {
    if (!folderToDelete) return
    setDeletingFolderBusy(true)
    await fetch(`${foldersApi}/${folderToDelete.id}?mode=${mode}`, { method: 'DELETE' })
    setDeletingFolderBusy(false)
    setFolderToDelete(null)
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
    await fetch(`${filesApi}?id=${fileId}`, {
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
    await fetch(`${filesApi}?id=${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId }),
    })
    loadData()
  }

  // ── Marquee (rubber-band) selection ─────────────────────────────────────────
  // Mirrors Google Drive: mousedown-drag over empty space draws a selection
  // rectangle; anything it overlaps on release becomes the new selection.
  // Starting on a file row is reserved for the native drag-to-move gesture
  // above, so this only engages when the mousedown target isn't inside a
  // row/card/interactive control.

  function handleAreaMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, a, [data-file-row], [data-folder-card]')) return
    const rect = contentAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setMarqueeStart(point)
    setMarqueeCurrent(point)
    previewIdsRef.current = new Set()
    previewFolderIdsRef.current = new Set()
    setPreviewIds(new Set())
    setPreviewFolderIds(new Set())
  }

  useEffect(() => {
    if (!marqueeStart) return

    function hitTest(rect: DOMRect, x1: number, x2: number, y1: number, y2: number, refs: Map<string, HTMLDivElement>) {
      const next = new Set<string>()
      refs.forEach((el, id) => {
        const r = el.getBoundingClientRect()
        const relLeft = r.left - rect.left, relTop = r.top - rect.top
        const relRight = relLeft + r.width, relBottom = relTop + r.height
        if (relLeft < x2 && relRight > x1 && relTop < y2 && relBottom > y1) next.add(id)
      })
      return next
    }

    function onMove(e: MouseEvent) {
      const rect = contentAreaRef.current?.getBoundingClientRect()
      if (!rect || !marqueeStart) return
      const current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setMarqueeCurrent(current)

      const x1 = Math.min(marqueeStart.x, current.x), x2 = Math.max(marqueeStart.x, current.x)
      const y1 = Math.min(marqueeStart.y, current.y), y2 = Math.max(marqueeStart.y, current.y)
      const nextFiles = hitTest(rect, x1, x2, y1, y2, fileRowRefs.current)
      const nextFolders = hitTest(rect, x1, x2, y1, y2, folderCardRefs.current)
      previewIdsRef.current = nextFiles
      previewFolderIdsRef.current = nextFolders
      setPreviewIds(nextFiles)
      setPreviewFolderIds(nextFolders)
    }

    function onUp() {
      setSelectedIds(new Set(previewIdsRef.current))
      setSelectedFolderIds(new Set(previewFolderIdsRef.current))
      setMarqueeStart(null)
      setMarqueeCurrent(null)
      setPreviewIds(new Set())
      setPreviewFolderIds(new Set())
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [marqueeStart])

  // ── Upload ──────────────────────────────────────────────────────────────────

  function addEntries(entries: PendingEntry[]) {
    const tooBig = entries.filter(e => e.file.size > 500 * 1024 * 1024)
    const ok = entries.filter(e => e.file.size <= 500 * 1024 * 1024)
    setUploadError(tooBig.length ? `${tooBig.length} bestand${tooBig.length !== 1 ? 'en zijn' : ' is'} groter dan 500 MB en werd${tooBig.length !== 1 ? 'en' : ''} overgeslagen.` : null)
    setUploadSuccess(null)
    if (ok.length) setPendingEntries(prev => [...prev, ...ok])
  }

  function removeEntry(index: number) {
    setPendingEntries(prev => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (!pendingEntries.length) return
    setUploading(true); setUploadError(null); setUploadSuccess(null)

    // Resolve (and create, if missing) every folder implied by the batch's
    // relative paths, sequentially — so two files headed for the same new
    // subfolder never race each other into creating it twice.
    const dirOf = (relativePath: string) => {
      const idx = relativePath.lastIndexOf('/')
      return idx === -1 ? '' : relativePath.slice(0, idx)
    }

    const folderCache = new Map<string, string | null>([['', currentFolderId]])

    async function resolveFolderId(dirPath: string): Promise<string | null> {
      if (folderCache.has(dirPath)) return folderCache.get(dirPath)!
      const idx = dirPath.lastIndexOf('/')
      const name = idx === -1 ? dirPath : dirPath.slice(idx + 1)
      const parentPath = idx === -1 ? '' : dirPath.slice(0, idx)
      const parentId = await resolveFolderId(parentPath)

      const listRes = await fetch(`${foldersApi}?${scopeQuery}&parentId=${parentId ?? 'null'}`)
      const existing: FolderRecord[] = listRes.ok ? await listRes.json() : []
      let match = existing.find(f => f.name === name)

      if (!match) {
        const createRes = await fetch(foldersApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [scopeKey]: scopeValue, name, parentId }),
        })
        match = createRes.ok ? await createRes.json() : undefined
      }

      const id = match?.id ?? null
      folderCache.set(dirPath, id)
      return id
    }

    const uniqueDirs = Array.from(new Set(pendingEntries.map(e => dirOf(e.relativePath))))
      .filter(d => d !== '')
      .sort((a, b) => a.split('/').length - b.split('/').length)

    try {
      for (const dir of uniqueDirs) await resolveFolderId(dir)
    } catch {
      setUploadError('Kon mapstructuur niet aanmaken.')
      setUploading(false)
      return
    }

    // Upload the files themselves, a few at a time.
    const CONCURRENCY = 3
    let cursor = 0
    let doneCount = 0
    let errorCount = 0

    async function worker() {
      while (cursor < pendingEntries.length) {
        const i = cursor++
        const entry = pendingEntries[i]
        setPendingEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'uploading', progress: 0 } : e))
        try {
          const folderId = folderCache.get(dirOf(entry.relativePath)) ?? null

          // 1. Open a Drive resumable-upload session (small, fast, no bytes).
          const sessionRes = await fetch(`${filesApi}/upload-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              [scopeKey]: scopeValue,
              folderId,
              filename: entry.file.name,
              mimeType: entry.file.type || 'application/octet-stream',
              fileSize: entry.file.size,
            }),
          })
          if (!sessionRes.ok) {
            const { error } = await sessionRes.json().catch(() => ({ error: `Upload mislukt (${sessionRes.status}).` }))
            throw new Error(error ?? 'Upload mislukt.')
          }
          const { uploadUrl } = await sessionRes.json()

          // 2. PUT the file straight to Drive — never touches our server.
          const driveFileId = await putFileToDrive(entry.file, uploadUrl, (pct) => {
            setPendingEntries(prev => prev.map((e, j) => j === i ? { ...e, progress: pct } : e))
          })

          // 3. Tell our server what landed, so it can write the DB row.
          const finalizeRes = await fetch(`${filesApi}/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              [scopeKey]: scopeValue,
              folderId,
              description: description.trim() || null,
              driveFileId,
            }),
          })
          if (!finalizeRes.ok) {
            const { error } = await finalizeRes.json().catch(() => ({ error: `Opslaan mislukt (${finalizeRes.status}).` }))
            throw new Error(error ?? 'Opslaan mislukt.')
          }

          setPendingEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'done', progress: 100 } : e))
          doneCount++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setPendingEntries(prev => prev.map((e, j) => j === i ? { ...e, status: 'error', error: msg } : e))
          errorCount++
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pendingEntries.length) }, worker))

    if (errorCount === 0) {
      setUploadSuccess(`${doneCount} bestand${doneCount !== 1 ? 'en' : ''} succesvol geüpload.`)
      setPendingEntries([]); setDescription('')
    } else {
      setUploadError(`${errorCount} bestand${errorCount !== 1 ? 'en' : ''} mislukt, ${doneCount} gelukt.`)
    }
    loadData()
    setUploading(false)
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
      const res = await fetch(`${filesApi}?id=${file.id}&mode=content`)
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
      const res = await fetch(`${filesApi}?id=${editingFile.id}`, {
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
      const res = await fetch(`${filesApi}?id=${file.id}`)
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
    const res = await fetch(`${filesApi}?id=${fileId}`, { method: 'DELETE' })
    const result = await res.json().catch(() => null)
    setDeleteWarning(result?.warning ?? null)
    loadData(); setDeletingId(null)
  }

  function toggleSelect(fileId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId)
      return next
    })
  }

  function toggleSelectFolder(folderId: string) {
    setSelectedFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId)
      return next
    })
  }

  // ── Zip download ────────────────────────────────────────────────────────────

  async function fetchFolderContents(folderId: string): Promise<{ folderName: string; files: { id: string; filename: string; relativePath: string }[] }> {
    const res = await fetch(`${foldersApi}/${folderId}/contents`)
    if (!res.ok) throw new Error('Kon mapinhoud niet ophalen.')
    return res.json()
  }

  async function saveZip(zip: JSZip, filename: string) {
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  async function handleDownloadSelection() {
    if (!selectedIds.size && !selectedFolderIds.size) return
    setDownloadingZip(true)
    setZipError(null)
    try {
      const zip = new JSZip()

      await Promise.all(Array.from(selectedIds).map(async (id) => {
        const file = files.find(f => f.id === id)
        if (!file) return
        const blob = await fetch(`${filesApi}/download?id=${id}`).then(r => r.blob())
        zip.file(file.filename, blob)
      }))

      await Promise.all(Array.from(selectedFolderIds).map(async (folderId) => {
        const { folderName, files: folderFiles } = await fetchFolderContents(folderId)
        await Promise.all(folderFiles.map(async (f) => {
          const blob = await fetch(`${filesApi}/download?id=${f.id}`).then(r => r.blob())
          zip.file(`${folderName}/${f.relativePath}`, blob)
        }))
      }))

      const single = selectedIds.size === 0 && selectedFolderIds.size === 1
        ? folders.find(f => f.id === Array.from(selectedFolderIds)[0])?.name
        : null
      await saveZip(zip, `${single ?? rootLabel}.zip`)
    } catch {
      setZipError('Kon de download niet voltooien.')
    }
    setDownloadingZip(false)
  }

  async function handleDownloadCurrentFolder() {
    if (!currentFolderId) return
    setDownloadingZip(true)
    setZipError(null)
    try {
      const { folderName, files: folderFiles } = await fetchFolderContents(currentFolderId)
      const zip = new JSZip()
      await Promise.all(folderFiles.map(async (f) => {
        const blob = await fetch(`${filesApi}/download?id=${f.id}`).then(r => r.blob())
        zip.file(f.relativePath, blob)
      }))
      await saveZip(zip, `${folderName}.zip`)
    } catch {
      setZipError('Kon de map niet downloaden.')
    }
    setDownloadingZip(false)
  }

  async function handleMassDelete() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    if (!confirm(`${ids.length} bestand${ids.length !== 1 ? 'en' : ''} verwijderen? Ze komen in de prullenbak terecht.`)) return

    setBulkDeleting(true)
    const results = await Promise.all(
      ids.map(id => fetch(`${filesApi}?id=${id}`, { method: 'DELETE' }).then(r => r.json().catch(() => null)))
    )
    const warnings = results.filter(r => r?.warning).length
    setDeleteWarning(warnings > 0 ? `${warnings} van de ${ids.length} bestanden werden verwijderd uit de app, maar niet volledig naar de prullenbak in Drive verplaatst.` : null)
    setSelectedIds(new Set())
    loadData()
    setBulkDeleting(false)
  }

  async function handleRestore(fileId: string) {
    setRestoringId(fileId)
    await fetch(`${filesApi}/restore?id=${fileId}`, { method: 'POST' })
    await loadTrash()
    setRestoringId(null)
  }

  async function handlePurge(fileId: string) {
    if (!confirm('Definitief verwijderen? Dit bestand kan hierna niet meer teruggezet worden.')) return
    setPurgingId(fileId)
    await fetch(`${filesApi}/purge?id=${fileId}`, { method: 'DELETE' })
    await loadTrash()
    setPurgingId(null)
  }

  // ── Filters ─────────────────────────────────────────────────────────────────

  const isGlobalSearch = search.trim().length > 0
  const q = search.toLowerCase()

  const matchesType = (f: { file_type: string }) =>
    typeFilter === 'all' || getFileCategory(f.file_type) === typeFilter

  // Local folder view (no search)
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(q))
  const filteredFiles = sortFileRecords(
    files.filter(f =>
      matchesType(f) && (f.filename.toLowerCase().includes(q) || (f.description?.toLowerCase().includes(q) ?? false))
    ),
    sortKey
  )

  // Global search results filtered client-side
  const filteredGlobal = sortFileRecords(
    globalResults.filter(f =>
      matchesType(f) && (f.filename.toLowerCase().includes(q) || (f.description?.toLowerCase().includes(q) ?? false))
    ),
    sortKey
  )

  const hasResults = isGlobalSearch
    ? filteredGlobal.length > 0
    : filteredFolders.length > 0 || filteredFiles.length > 0

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-8">
    <div className="max-w-5xl mx-auto">

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
        {canManage && (
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
        )}
        {!showTrash && !isGlobalSearch && breadcrumbs.length > 1 && (
          <button
            onClick={handleDownloadCurrentFolder}
            disabled={downloadingZip}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-white rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {downloadingZip ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Map downloaden
          </button>
        )}
        <button
          onClick={() => setShowTrash(v => !v)}
          className={`flex items-center gap-2 px-3.5 py-2 border text-sm rounded-lg transition-colors flex-shrink-0 ${
            showTrash
              ? 'bg-zinc-700 border-zinc-600 text-white'
              : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
          }`}
        >
          <Trash2 size={14} />
          Prullenbak
        </button>
      </div>

      {/* Sort + type filter */}
      {!showTrash && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-shrink-0">
            <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="appearance-none pl-7 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors cursor-pointer"
            >
              <option value="date-desc">Datum (nieuw-oud)</option>
              <option value="date-asc">Datum (oud-nieuw)</option>
              <option value="name-asc">Naam (A-Z)</option>
              <option value="name-desc">Naam (Z-A)</option>
              <option value="size-desc">Grootte (groot-klein)</option>
              <option value="size-asc">Grootte (klein-groot)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {([
              ['all', 'Alles'],
              ['image', 'Afbeeldingen'],
              ['video', "Video's"],
              ['document', 'Documenten'],
              ['other', 'Overig'],
            ] as [TypeFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTypeFilter(value)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  typeFilter === value
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {deleteWarning && (
        <div className="flex items-start gap-2 px-3 py-2.5 mb-5 bg-amber-950/50 border border-amber-900/50 rounded-lg">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400 flex-1">{deleteWarning}</p>
          <button onClick={() => setDeleteWarning(null)} aria-label="Melding sluiten" className="text-amber-400/70 hover:text-amber-300 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {zipError && (
        <div className="flex items-start gap-2 px-3 py-2.5 mb-5 bg-red-950/50 border border-red-900/50 rounded-lg">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 flex-1">{zipError}</p>
          <button onClick={() => setZipError(null)} aria-label="Foutmelding sluiten" className="text-red-400/70 hover:text-red-300 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {!showTrash && (selectedIds.size > 0 || selectedFolderIds.size > 0) && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-5 bg-zinc-800/60 border border-zinc-700 rounded-lg">
          <p className="text-xs text-zinc-300 flex-1">
            {selectedIds.size > 0 && `${selectedIds.size} bestand${selectedIds.size !== 1 ? 'en' : ''}`}
            {selectedIds.size > 0 && selectedFolderIds.size > 0 && ' en '}
            {selectedFolderIds.size > 0 && `${selectedFolderIds.size} map${selectedFolderIds.size !== 1 ? 'pen' : ''}`}
            {' geselecteerd'}
          </p>
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectedFolderIds(new Set()) }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Selectie wissen
          </button>
          <button
            onClick={handleDownloadSelection}
            disabled={downloadingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-all"
          >
            {downloadingZip ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Downloaden
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleMassDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-400 hover:bg-zinc-700 disabled:opacity-40 transition-all"
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Verwijderen
            </button>
          )}
        </div>
      )}

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
              aria-label="Bevestigen"
              className="p-1.5 rounded-md text-emerald-400 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {creatingFolder ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); setCreateFolderError(null) }}
              aria-label="Annuleren"
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

      {/* ── Prullenbak ── */}
      {showTrash && (
        <div className="mb-6">
          {trashLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="animate-spin text-zinc-600" />
            </div>
          ) : trashedFiles.length === 0 ? (
            <p className="text-sm text-zinc-500 py-16 text-center">De prullenbak is leeg.</p>
          ) : (
            <div className="space-y-1.5">
              {trashedFiles.map((file) => {
                const { icon: Icon, color, bg } = getFileIcon(file.file_type)
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg"
                  >
                    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 opacity-60`}>
                      <Icon size={15} className={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-300 truncate">{file.filename}</p>
                      <p className="text-xs text-zinc-600">
                        {formatSize(file.file_size)}
                        {file.deleted_at && ` · Verwijderd op ${new Date(file.deleted_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(file.id)}
                        disabled={restoringId === file.id}
                        className="px-3 py-1.5 rounded-md text-xs font-medium text-emerald-400 hover:bg-zinc-800 disabled:opacity-40 transition-all"
                      >
                        {restoringId === file.id ? <Loader2 size={13} className="animate-spin" /> : 'Terugzetten'}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handlePurge(file.id)}
                          disabled={purgingId === file.id}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-red-400 hover:bg-zinc-800 disabled:opacity-40 transition-all"
                        >
                          {purgingId === file.id ? <Loader2 size={13} className="animate-spin" /> : 'Definitief verwijderen'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Global search results ── */}
      {!showTrash && isGlobalSearch && (
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
                  const canDelete = canDeleteFiles || file.uploaded_by === currentUserEmail
                  const canEdit = isAdmin || file.uploaded_by === currentUserEmail
                  const isText = TEXT_EXTENSIONS.has(file.file_type.toLowerCase())
                  const isPreviewable = file.storage_provider === 'drive' && !!file.drive_file_id
                  return (
                    <div
                      key={file.id}
                      onDoubleClick={() => { if (isPreviewable) setPreviewFile(file) }}
                      className={`flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors ${isPreviewable ? 'cursor-pointer' : ''}`}
                    >
                      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                        <FileTile file={file} icon={Icon} color={color} />
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
                            onClick={(e) => { e.stopPropagation(); openEdit(file) }}
                            title="Bewerken"
                            className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
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
                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id) }}
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

      </div>

      {/* Content — full-width hit area for drag-select (extends into the side
          gutters up to this page's own edges), inner content still centered */}
      {!showTrash && !isGlobalSearch && loading ? (
        <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      ) : !showTrash && !isGlobalSearch && (
        <div ref={contentAreaRef} onMouseDown={handleAreaMouseDown} className="relative select-none pt-3 -mt-3 pb-16">
          {marqueeStart && marqueeCurrent && (
            <div
              className="absolute border border-emerald-500/70 bg-emerald-500/10 pointer-events-none z-10"
              style={{
                left: Math.min(marqueeStart.x, marqueeCurrent.x),
                top: Math.min(marqueeStart.y, marqueeCurrent.y),
                width: Math.abs(marqueeCurrent.x - marqueeStart.x),
                height: Math.abs(marqueeCurrent.y - marqueeStart.y),
              }}
            />
          )}
          <div className="max-w-5xl mx-auto">
          {/* Folder grid */}
          {filteredFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
              {filteredFolders.map((folder) => {
                const isOver = dragOverFolderId === folder.id
                const isFolderSelected = selectedFolderIds.has(folder.id)
                const isFolderPreviewSelected = previewFolderIds.has(folder.id) && !isFolderSelected
                return (
                  <div
                    key={folder.id}
                    data-folder-card
                    ref={(el) => { if (el) folderCardRefs.current.set(folder.id, el); else folderCardRefs.current.delete(folder.id) }}
                    className="relative group"
                  >
                    {renamingId !== folder.id && (
                      <div className="absolute top-2 left-2 z-10">
                        <SelectCheckbox checked={isFolderSelected} onToggle={() => toggleSelectFolder(folder.id)} />
                      </div>
                    )}
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
                        <button onClick={() => handleRenameFolder(folder.id)} aria-label="Bevestigen" className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
                          <Check size={11} />
                        </button>
                        <button onClick={() => setRenamingId(null)} aria-label="Annuleren" className="text-zinc-500 hover:text-zinc-300 flex-shrink-0">
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
                            : isFolderSelected
                              ? 'border-emerald-700 bg-emerald-950/20'
                              : isFolderPreviewSelected
                                ? 'border-zinc-500 bg-zinc-700/50'
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
                      <div className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${canManage ? '' : 'hidden'}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === folder.id ? null : folder.id)
                          }}
                          aria-label="Meer opties"
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
                                openDeleteFolderConfirm(folder)
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
                const canDelete = canDeleteFiles || file.uploaded_by === currentUserEmail
                const canEdit = isAdmin || file.uploaded_by === currentUserEmail
                const isText = TEXT_EXTENSIONS.has(file.file_type.toLowerCase())
                const isDraggingThis = draggingFileId === file.id
                const isPreviewable = file.storage_provider === 'drive' && !!file.drive_file_id
                const isSelected = selectedIds.has(file.id)
                const isPreviewSelected = previewIds.has(file.id) && !isSelected
                return (
                  <div
                    key={file.id}
                    data-file-row
                    ref={(el) => { if (el) fileRowRefs.current.set(file.id, el); else fileRowRefs.current.delete(file.id) }}
                    draggable
                    onDragStart={(e) => onFileDragStart(e, file.id)}
                    onDragEnd={onFileDragEnd}
                    onDoubleClick={() => { if (isPreviewable) setPreviewFile(file) }}
                    className={`flex items-center gap-3 px-4 py-3 border rounded-lg group transition-all cursor-grab active:cursor-grabbing ${
                      isPreviewable ? 'cursor-pointer' : ''
                    } ${isDraggingThis ? 'opacity-40 scale-95' : ''} ${
                      isSelected
                        ? 'bg-emerald-950/20 border-emerald-800/60'
                        : isPreviewSelected
                          ? 'bg-zinc-700/50 border-zinc-500'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {canDelete && (
                      <SelectCheckbox checked={isSelected} onToggle={() => toggleSelect(file.id)} />
                    )}

                    {/* Drag handle hint */}
                    <GripVertical size={13} className="text-zinc-700 group-hover:text-zinc-500 flex-shrink-0 transition-colors" />

                    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                      <FileTile file={file} icon={Icon} color={color} />
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
                          onClick={(e) => { e.stopPropagation(); openEdit(file) }}
                          title="Bewerken"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
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
                          onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id) }}
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
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">

      {/* ── Upload zone ── */}
      {!showTrash && canManage && (
      <div className="mt-6 pt-6 border-t border-zinc-800 space-y-3">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
          Uploaden{breadcrumbs.length > 1 ? ` in "${breadcrumbs[breadcrumbs.length - 1].name}"` : ''}
        </p>

        <div
          onClick={() => pendingEntries.length === 0 && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!draggingFileId) setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault(); setIsDragging(false)
            // Only handle real file/folder drops (from OS), not internal file-to-folder drags
            if (draggingFileId) return
            addEntries(await collectDroppedEntries(e.dataTransfer))
          }}
          className={`
            border-2 border-dashed rounded-xl p-5 text-center transition-all
            ${pendingEntries.length > 0 ? 'border-zinc-700 bg-zinc-900/30' : 'cursor-pointer'}
            ${isDragging
              ? 'border-zinc-500 bg-zinc-800/50'
              : pendingEntries.length === 0 ? 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50' : ''}
          `}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              addEntries(files.map(file => ({ file, relativePath: file.name, status: 'pending' as const, progress: 0 })))
              e.target.value = ''
            }}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              addEntries(files.map(file => ({
                file,
                relativePath: file.webkitRelativePath || file.name,
                status: 'pending' as const,
                progress: 0,
              })))
              e.target.value = ''
            }}
            className="hidden"
          />
          {pendingEntries.length > 0 ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto text-left" onClick={(e) => e.stopPropagation()}>
              {pendingEntries.map((entry, i) => (
                <div key={i} className="px-2 py-1.5 rounded-lg bg-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    <Upload size={12} className="text-zinc-500 flex-shrink-0" />
                    <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{entry.relativePath}</span>
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 hidden sm:block">{formatSize(entry.file.size)}</span>
                    {uploading ? (
                      <span className="flex-shrink-0 w-8 text-center text-[10px]" style={{
                        color: entry.status === 'done' ? '#4ade80' : entry.status === 'error' ? '#f87171' : '#a1a1aa',
                      }}>
                        {entry.status === 'done'
                          ? '✓'
                          : entry.status === 'error'
                            ? '✗'
                            : entry.status === 'uploading'
                              ? `${entry.progress}%`
                              : <Loader2 size={12} className="animate-spin inline" />}
                      </span>
                    ) : (
                      <button onClick={() => removeEntry(i)} aria-label="Verwijder uit lijst" className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {entry.status === 'uploading' && (
                    <div className="mt-1.5 h-1 rounded-full bg-zinc-700/60 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${entry.progress}%`, backgroundColor: '#3A913F' }}
                      />
                    </div>
                  )}
                  {entry.status === 'error' && entry.error && (
                    <p className="mt-1 text-[10px] text-red-400 truncate">{entry.error}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={18} className="text-zinc-500" />
              <p className="text-sm text-zinc-400">Sleep bestanden of een map, of klik om te uploaden</p>
              <p className="text-xs text-zinc-600">
                Meerdere bestanden tegelijk mogelijk — max 500 MB per bestand ·{' '}
                <button
                  onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
                  className="underline hover:text-zinc-400 transition-colors"
                >
                  of upload een map
                </button>
              </p>
              <p className="text-[11px] text-zinc-700">{ALLOWED_UPLOAD_HINT}</p>
            </div>
          )}
        </div>

        {pendingEntries.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600">
                {pendingEntries.length} bestand{pendingEntries.length !== 1 ? 'en' : ''} geselecteerd
              </p>
              {!uploading && (
                <button onClick={() => setPendingEntries([])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  Alles wissen
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Beschrijving (optioneel, geldt voor alle bestanden)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: '#3A913F' }}
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" /> Uploaden...</>
                : <><Upload size={14} /> {pendingEntries.length} bestand{pendingEntries.length !== 1 ? 'en' : ''} uploaden</>}
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
      )}

      {/* Backdrop to close menus */}
      {menuOpenId && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpenId(null)} />
      )}

      {/* ── Folder delete confirmation ── */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(18,18,18,0.98)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div className="px-5 py-4 border-b border-zinc-800">
              <p className="text-sm font-semibold text-white">Map &ldquo;{folderToDelete.name}&rdquo; verwijderen</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-zinc-400">
                {folderDeleteContentsCount === null
                  ? 'Bezig met controleren van de inhoud...'
                  : folderDeleteContentsCount === 0
                    ? 'Deze map (en eventuele submappen) is leeg. Wat wil je doen?'
                    : `Deze map bevat ${folderDeleteContentsCount} bestand${folderDeleteContentsCount !== 1 ? 'en' : ''} (submappen inbegrepen). Wat wil je ermee doen?`}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 pb-5">
              <button
                onClick={() => performFolderDelete('delete')}
                disabled={deletingFolderBusy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: '#dc2626' }}
              >
                {deletingFolderBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Verwijder inhoud (naar prullenbak)
              </button>
              <button
                onClick={() => performFolderDelete('move')}
                disabled={deletingFolderBusy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                Verplaats inhoud naar boven
              </button>
              <button
                onClick={() => setFolderToDelete(null)}
                disabled={deletingFolderBusy}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
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
                aria-label="Sluiten"
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

      {previewFile?.drive_file_id && (
        <DrivePreviewModal
          driveFileId={previewFile.drive_file_id}
          title={previewFile.filename}
          webViewLink={previewFile.web_view_link}
          downloadHref={`${filesApi}/download?id=${previewFile.id}`}
          onClose={() => setPreviewFile(null)}
        />
      )}
      </div>
    </div>
  )
}
