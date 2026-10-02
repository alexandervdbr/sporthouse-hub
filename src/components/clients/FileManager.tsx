'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import {
  Folder, FolderOpen, ChevronRight, Home,
  Upload, Download, Trash2, Loader2, Search,
  Pencil, MoreVertical, X, Check, FolderPlus,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, File, FileCode, FileType2,
  AlertCircle, GripVertical, ArrowUpDown, Palette, Link2,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import JSZip from 'jszip'
import { FileRecord } from '@/types/database'
import { DriveThumbnail, DrivePreviewModal } from '@/components/shared/DrivePreview'
import { extractVideoPoster, extractImagePoster, IMAGE_POSTER_MIN_BYTES } from '@/lib/media-poster'
import { ALLOWED_UPLOAD_HINT, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-policy'

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
// (except the final chunk). Capped at 4 MiB because every chunk travels
// through our own /api/files/upload-relay route, and Vercel rejects any
// function request body over 4.5 MB with a 413 before our code ever runs —
// at 8 MiB that meant every file larger than 4.5 MB failed to upload.
// Smaller chunks also keep any single request short-lived, so a network blip
// only ever costs one chunk instead of the whole file.
const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024

// Zipping happens entirely in this tab: every file is pulled into memory as a
// blob, JSZip holds them all, and generateAsync builds one more copy of the
// lot. That caps how much can be downloaded at once far below what can be
// stored — a couple of large videos is enough to take the tab down, and a
// crashed tab is a worse answer than a refusal.
//
// Above this, we hand the job to Drive, which zips server-side for free.
const FOLDER_CACHE_LIMIT = 50

const MAX_ZIP_BYTES = 500 * 1024 * 1024
const MAX_ZIP_LABEL = '500 MB'

function driveFolderUrl(driveFolderId: string) {
  return `https://drive.google.com/drive/folders/${driveFolderId}`
}

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
function putChunk(
  uploadUrl: string, file: File, start: number, end: number,
  onChunkProgress?: (loaded: number) => void
): Promise<{ done: boolean; driveFileId?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', '/api/files/upload-relay')
    xhr.setRequestHeader('X-Upload-Url', uploadUrl)
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${file.size}`)
    // Without this, progress only ever updates at chunk boundaries (every
    // UPLOAD_CHUNK_SIZE) — for any file smaller than one chunk, that means
    // it sits at 0% for the whole upload and jumps straight to 100%.
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress?.(e.loaded)
    }
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
    const chunkStart = offset
    try {
      const result = await putChunk(uploadUrl, file, offset, end, (loaded) => {
        onProgress(Math.round(((chunkStart + loaded) / file.size) * 100))
      })
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
const DESIGN_EXTS = ['psd', 'psb', 'ai', 'indd', 'idml', 'eps', 'xd', 'sketch', 'fig', 'afphoto', 'afdesign', 'afpub', 'aep', 'prproj', 'mogrt']
// Formats that carry their own preview image, readable even when Drive won't
// render one (see lib/psd-thumbnail).
const EMBEDDED_PREVIEW_EXTS = ['psd', 'psb']

function fileExtOf(filename: string): string {
  return filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
}

function getFileIcon(fileType: string) {
  const t = fileType.toLowerCase()
  if (IMAGE_EXTS.includes(t)) return { icon: FileImage, color: 'text-blue-400', bg: 'bg-blue-950/50' }
  if (VIDEO_EXTS.includes(t)) return { icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-950/50' }
  if (AUDIO_EXTS.includes(t)) return { icon: FileAudio, color: 'text-pink-400', bg: 'bg-pink-950/50' }
  if (ARCHIVE_EXTS.includes(t)) return { icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-950/50' }
  if (CODE_EXTS.includes(t)) return { icon: FileCode, color: 'text-emerald-400', bg: 'bg-emerald-950/50' }
  if (DOC_EXTS.includes(t)) return { icon: FileText, color: 'text-zinc-300', bg: 'bg-zinc-800' }
  if (FONT_EXTS.includes(t)) return { icon: FileType2, color: 'text-cyan-400', bg: 'bg-cyan-950/50' }
  if (DESIGN_EXTS.includes(t)) return { icon: Palette, color: 'text-indigo-400', bg: 'bg-indigo-950/50' }
  return { icon: File, color: 'text-zinc-400', bg: 'bg-zinc-800' }
}

type TypeFilter = 'all' | 'image' | 'video' | 'document' | 'other'

// Formats worth showing as a flat preview image instead of Drive's viewer:
// ones where the rendered image IS the content.
//
// Video is deliberately not one of them. A still frame is the right thing on
// a list tile, but in the viewer it only adds a click — you'd press play on
// the poster, wait for Drive's player to load, and press play again. Opening
// a video goes straight to the player instead.
//
// PDFs and text are excluded for the opposite reason: you want the real
// viewer to page or read those. That also keeps the inline text editor
// honest, since it rewrites a file's contents under the same id
// (updateFileContent) while preview images are cached as immutable.
function canPreviewAsImage(fileType: string): boolean {
  const t = fileType.toLowerCase()
  return IMAGE_EXTS.includes(t) || DESIGN_EXTS.includes(t)
}

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
function FileTile({ file, icon: Icon, color, filesApi }: { file: FileRecord; icon: typeof File; color: string; filesApi: string }) {
  // Served through our own proxy rather than the thumbnail_link stored on the
  // row: Google's link is session-bound and 403s within about a day, so tiles
  // for anything but freshly uploaded files quietly fell back to the generic
  // icon. Same lesson /api/reels/thumbnail and /api/files/download each hit
  // before this. The row's thumbnail_link is now only a record of whether
  // Drive ever managed to render one at all.
  // thumbnail_link records whether Drive ever rendered a preview. A PSD is
  // worth asking for even when it didn't: above roughly 40-90 MB Drive gives
  // up entirely, and those files fall back to the preview Photoshop embedded
  // — which at tile size is indistinguishable from the real thing. A miss
  // costs nothing: DriveThumbnail lands on the icon either way.
  const worthAsking = file.thumbnail_link
    || EMBEDDED_PREVIEW_EXTS.includes(file.file_type.toLowerCase())
    || getFileCategory(file.file_type) === 'video'

  if (file.storage_provider === 'drive' && worthAsking) {
    return (
      <DriveThumbnail
        src={`${filesApi}/thumbnail?id=${file.id}&size=small`}
        alt={file.filename}
        video={getFileCategory(file.file_type) === 'video'}
      />
    )
  }
  return <Icon size={15} className={color} />
}

// One shape for every in-page notice. These were written out seven times,
// identical apart from the text and the colour, which is how two of them had
// already drifted — one lost its close button, another used a different
// label on it. The upload panel keeps its own, larger pair: they sit inside
// that panel rather than above the list, and read as part of it.
function Notice({ tone, children, onDismiss }: {
  tone: 'error' | 'warning'
  children: React.ReactNode
  onDismiss?: () => void
}) {
  const colours = tone === 'error'
    ? { box: 'bg-red-950/50 border-red-900/50', icon: 'text-red-400', text: 'text-red-400', close: 'text-red-400/70 hover:text-red-300' }
    : { box: 'bg-amber-950/50 border-amber-900/50', icon: 'text-amber-400', text: 'text-amber-400', close: 'text-amber-400/70 hover:text-amber-300' }

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 border rounded-lg ${colours.box}`}>
      <AlertCircle size={14} className={`${colours.icon} flex-shrink-0 mt-0.5`} />
      <div className={`text-xs flex-1 ${colours.text}`}>{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Melding sluiten" className={`${colours.close} flex-shrink-0`}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// Our own player exists for one reason: on a phone the browser lays its own
// media controls over whatever is inside an iframe, so Drive's player ends up
// with two sets of buttons stacked on each other. On a desktop that doesn't
// happen, and Drive wins there — it streams straight from Google, while ours
// routes every byte through our own function first, which is slower to start.
//
// So: a touch device on a small screen gets our player, everything else gets
// Drive's. A touch-capable laptop keeps Drive's, which is what you want.
const TOUCH_QUERY = '(pointer: coarse) and (max-width: 1024px)'

function subscribeToTouch(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useIsHandheld() {
  // Server and first paint assume desktop; useSyncExternalStore corrects it on
  // hydration without the state-in-effect dance that would flag either way.
  return useSyncExternalStore(
    subscribeToTouch,
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false
  )
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

  // Navigation. The trail is the only stored state: where you are is simply
  // its last entry. Keeping a separate currentFolderId alongside it meant two
  // values that had to agree and could silently stop agreeing — which is
  // exactly what produced a breadcrumb pointing into a folder while the list
  // below it still showed the parent, with no click able to recover.
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: rootLabel }])
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id ?? null

  // Which listing is on screen right now. Used to tell "nothing to show yet"
  // apart from "showing the previous answer while a newer one arrives" —
  // blanking the list for a spinner on every refresh is what made navigating
  // feel slow even when the request itself was quick.
  // Which listing the UI is currently on, readable from inside a callback
  // that was created some renders ago. Aborting the previous request isn't
  // enough on its own: a handler like "drop a file on a breadcrumb" closes
  // over the folder you were in when it was created, so if the view moves on
  // before it runs, it starts a fetch for the folder you just left — and that
  // answer is newer, so nothing stops it from landing on top. Checked against
  // this before anything is painted.
  const listingKeyRef = useRef<string>('')
  const isHandheld = useIsHandheld()

  const listingKey = `${scopeQuery}|${currentFolderId ?? 'null'}`
  listingKeyRef.current = listingKey

  // Bumped by every navigation, so landing on the folder you're already in
  // still reloads instead of doing nothing at all. Without it a view that got
  // out of step for any reason stayed stuck until a page reload.
  const [reloadNonce, setReloadNonce] = useState(0)

  // Nothing is fetched or persisted until the saved trail has been read back,
  // so a visit costs one request for the folder you were in rather than one
  // for the root followed by one for the folder.
  const [restored, setRestored] = useState(false)

  // A file id from the link, held until its folder's contents have loaded —
  // only then is there a record to hand the preview.
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null)

  // Where to start: a folder named in the URL wins over the one you last
  // visited, so a shared link opens what the sender meant rather than
  // wherever the receiver happened to be. Falls back to sessionStorage, which
  // is what makes a plain reload keep your place.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const params = new URLSearchParams(window.location.search)
      const linkedFolder = params.get('folder')
      const linkedFile = params.get('file')
      if (linkedFile) setPendingPreviewId(linkedFile)

      if (linkedFolder) {
        try {
          const res = await fetch(`${foldersApi}/${linkedFolder}/path`)
          if (res.ok) {
            const { trail }: { trail: Breadcrumb[] } = await res.json()
            if (!cancelled && Array.isArray(trail) && trail.length > 0) {
              setBreadcrumbs([{ id: null, name: rootLabel }, ...trail])
              setRestored(true)
              return
            }
          }
          // A link to a folder that's gone, or that this account can't see,
          // lands at the root rather than on an error — the rest of the
          // client's files are still perfectly usable.
        } catch { /* fall through to the stored trail */ }
      }

      try {
        const raw = sessionStorage.getItem(`files-breadcrumbs-${scopeStorageKey}`)
        if (raw) {
          const saved: Breadcrumb[] = JSON.parse(raw)
          if (Array.isArray(saved) && saved.length > 0) {
            // Self-heal: collapse any duplicate folder ids a previously-
            // corrupted trail might contain, so a stale saved value can never
            // reproduce the "two children with the same key" crash.
            const deduped = saved.filter((b, i) => saved.findIndex(x => x.id === b.id) === i)
            if (!cancelled) setBreadcrumbs(deduped)
          }
        }
      } catch { /* ignore malformed/unavailable storage */ }

      if (!cancelled) setRestored(true)
    }

    restore()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeStorageKey])

  // Keep the address bar pointing at where you actually are, so copying it —
  // or using the copy-link button — gives a link that opens this folder.
  // Replaced rather than pushed: walking into a folder shouldn't turn the
  // browser's back button into a folder-history stepper people didn't ask for.
  useEffect(() => {
    if (!restored) return
    const url = new URL(window.location.href)
    if (currentFolderId) url.searchParams.set('folder', currentFolderId)
    else url.searchParams.delete('folder')
    // Only ever meaningful on the first load; leaving it in would re-open the
    // preview on every later visit to that link.
    url.searchParams.delete('file')
    window.history.replaceState(null, '', url)
  }, [currentFolderId, restored])

  useEffect(() => {
    // Guarded on `restored`: this effect also runs on the very first commit,
    // when breadcrumbs still holds the default root — writing that would wipe
    // the saved trail a moment before it gets read back.
    if (!restored) return
    try {
      sessionStorage.setItem(`files-breadcrumbs-${scopeStorageKey}`, JSON.stringify(breadcrumbs))
    } catch { /* ignore, e.g. private-browsing storage restrictions */ }
  }, [breadcrumbs, scopeStorageKey, restored])

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
  const [moveError, setMoveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [trashError, setTrashError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [moveToast, setMoveToast] = useState<
    { file: FileRecord; cameFrom: string | null; cameFromKey: string; targetLabel: string } | null
  >(null)
  const [undoing, setUndoing] = useState(false)
  const [zipDriveUrl, setZipDriveUrl] = useState<string | null>(null)

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

  useEffect(() => {
    if (!folderToDelete && !editingFile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setFolderToDelete(null)
      setEditingFile(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folderToDelete, editingFile])

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

  // Every load cancels the one before it. Without this, two requests for
  // different folders could be in flight at once and the slower one would win
  // simply by landing last — leaving the list showing one folder while the
  // breadcrumb said another.
  const loadAbortRef = useRef<AbortController | null>(null)

  // What each folder looked like last time it was open. Finding a file means
  // walking in and out of folders, and re-fetching a listing you saw ten
  // seconds ago to draw exactly the same rows is the slowest part of that.
  // Served immediately, then refreshed in the background, so a revisit costs
  // nothing and still can't go stale.
  //
  // Capped because a long session should not accumulate listings forever;
  // listings are small, so this is about tidiness rather than real pressure.
  const folderCacheRef = useRef(new Map<string, { folders: FolderRecord[]; files: FileRecord[] }>())
  const [shownFor, setShownFor] = useState<string | null>(null)

  const loadData = useCallback(async (fromCache = false) => {
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    const { signal } = controller

    const fid = currentFolderId ?? 'null'
    const cacheKey = `${scopeQuery}|${fid}`

    if (fromCache) {
      const cached = folderCacheRef.current.get(cacheKey)
      if (cached) {
        setFolders(cached.folders)
        setFiles(cached.files)
        setShownFor(cacheKey)
      }
    } else {
      // A reload after a change must never be able to serve the listing from
      // before it — drop the entry so nothing can show a file that was just
      // deleted or renamed.
      folderCacheRef.current.delete(cacheKey)
    }

    setLoading(true)
    try {
      const [foldersRes, filesRes] = await Promise.all([
        fetch(`${foldersApi}?${scopeQuery}&parentId=${fid}`, { signal }),
        fetch(`${filesApi}?${scopeQuery}&folderId=${fid}`, { signal }),
      ])
      const [nextFolders, nextFiles] = await Promise.all([
        foldersRes.ok ? foldersRes.json() : null,
        filesRes.ok ? filesRes.json() : null,
      ])
      if (signal.aborted) return
      // The folder may have changed while this was in flight, by navigation
      // or by a handler that outlived it. Cache the answer — it's still a
      // correct listing of that folder — but don't put it on screen.
      if (cacheKey !== listingKeyRef.current) {
        if (nextFolders && nextFiles) {
          folderCacheRef.current.set(cacheKey, { folders: nextFolders, files: nextFiles })
        }
        return
      }
      if (nextFolders) setFolders(nextFolders)
      if (nextFiles) setFiles(nextFiles)
      if (nextFolders && nextFiles) {
        const cache = folderCacheRef.current
        cache.delete(cacheKey)
        cache.set(cacheKey, { folders: nextFolders, files: nextFiles })
        if (cache.size > FOLDER_CACHE_LIMIT) {
          // Map keeps insertion order, so the first key is the oldest touch.
          cache.delete(cache.keys().next().value!)
        }
      }
      setShownFor(cacheKey)
      setLoading(false)
    } catch (err) {
      // An abort means a newer load is already running and owns the spinner;
      // leaving `loading` alone here is what keeps it from flickering off
      // while that one is still going.
      if ((err as Error)?.name === 'AbortError') return
      console.error('Kon mapinhoud niet laden:', err)
      setLoading(false)
    }
    // reloadNonce is listed on purpose and never read: changing it is what
    // gives this callback a new identity, which is what makes the effect
    // below re-run. That's the whole point of it — a navigation that lands
    // on the folder we're already in has nothing else to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersApi, filesApi, scopeQuery, currentFolderId, reloadNonce])

  useEffect(() => {
    if (!restored) return
    // Navigation may paint from cache; reloads after a change may not.
    loadData(true)
  }, [loadData, restored])

  useEffect(() => () => loadAbortRef.current?.abort(), [])

  // A link can point at one file, not just a folder. Acted on once the
  // listing is in, since the preview needs the record and not just an id —
  // and cleared either way, so a file that's been moved or deleted doesn't
  // leave this waiting forever.
  useEffect(() => {
    if (!pendingPreviewId || loading) return
    const target = files.find(f => f.id === pendingPreviewId)
    if (target?.drive_file_id) setPreviewFile(target)
    setPendingPreviewId(null)
  }, [pendingPreviewId, loading, files])

  useEffect(() => {
    if (!copiedLabel) return
    const timer = setTimeout(() => setCopiedLabel(null), 4000)
    return () => clearTimeout(timer)
  }, [copiedLabel])

  // Upload feedback clears itself too. It used to sit there until a reload,
  // so a success from ten minutes ago still looked like it had just happened.
  // Errors get longer: they're worth reading, and sometimes acting on.
  useEffect(() => {
    if (!uploadSuccess) return
    const timer = setTimeout(() => setUploadSuccess(null), 6000)
    return () => clearTimeout(timer)
  }, [uploadSuccess])

  useEffect(() => {
    if (!uploadError) return
    const timer = setTimeout(() => setUploadError(null), 12000)
    return () => clearTimeout(timer)
  }, [uploadError])

  // The confirmation is a courtesy, not a dialog: it clears itself. Pinned
  // open while an undo is running so it can't vanish mid-click.
  useEffect(() => {
    if (!moveToast || undoing) return
    const timer = setTimeout(() => setMoveToast(null), 8000)
    return () => clearTimeout(timer)
  }, [moveToast, undoing])

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
    setBreadcrumbs(prev => {
      // A folder's id should never legitimately reappear in its own trail —
      // that's what produces React's "two children with the same key" crash.
      // If it's somehow already there, cut back to it rather than appending:
      // the trail must always end at the folder just opened, since that's
      // what tells the rest of the component where we are.
      const existing = prev.findIndex(b => b.id === folder.id)
      if (existing !== -1) return prev.slice(0, existing + 1)
      return [...prev, { id: folder.id, name: folder.name }]
    })
    setReloadNonce(n => n + 1)
    setSearch('')
    setMenuOpenId(null)
    setSelectedIds(new Set())
    setSelectedFolderIds(new Set())
  }

  // A breadcrumb is both a place to click and a place to drop a file on. If
  // the browser follows a drop with a click — and dropping onto a <button>
  // can — you'd be moved out of the folder you were working in as a side
  // effect of moving a file out of it. Dropping should move the file and
  // leave you where you are.
  const justDroppedRef = useRef(false)

  function markDropped() {
    justDroppedRef.current = true
    setTimeout(() => { justDroppedRef.current = false }, 300)
  }

  function navigateToBreadcrumb(crumb: Breadcrumb, idx: number) {
    if (justDroppedRef.current) return
    // Clicking the crumb you're already on deliberately still reloads — it's
    // the obvious thing to try when a view looks wrong, so it should fix it.
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    setReloadNonce(n => n + 1)
    setSearch('')
    setSelectedIds(new Set())
    setSelectedFolderIds(new Set())
  }

  // ── Folder actions ──────────────────────────────────────────────────────────

  // A ref, not the creatingFolder state: two enter presses a few milliseconds
  // apart both read the state from the same render, so the flag hasn't
  // flipped yet for the second one. A ref changes immediately.
  const creatingFolderRef = useRef(false)

  async function handleCreateFolder() {
    if (!newFolderName.trim() || creatingFolderRef.current) return
    creatingFolderRef.current = true
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
    creatingFolderRef.current = false
  }

  async function handleRenameFolder(id: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    setRenameError(null)

    try {
      const res = await fetch(`${foldersApi}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || `Hernoemen mislukt (${res.status}).`)
      }
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Hernoemen mislukt.')
    }
    loadData()
  }

  async function handleRenameFile(file: FileRecord) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name || name === file.filename) return

    setRenameError(null)
    const previous = file.filename
    // Shown under the new name straight away; the request still has to reach
    // Drive, and that's not worth watching a spinner for.
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, filename: name } : f))
    folderCacheRef.current.delete(listingKeyRef.current)

    try {
      const res = await fetch(`${filesApi}?id=${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(result?.error ?? `Hernoemen mislukt (${res.status}).`)
      // The server may have put the extension back; show what it stored.
      if (result?.filename && result.filename !== name) {
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, filename: result.filename } : f))
      }
      folderCacheRef.current.clear()
    } catch (err) {
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, filename: previous } : f))
      setRenameError(err instanceof Error ? err.message : 'Hernoemen mislukt.')
    }
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
    const target = folderToDelete
    setDeletingFolderBusy(true)
    setDeleteError(null)

    // Off the list straight away. Deleting a folder means moving every file
    // inside it in Drive first, which for a folder holding a large video is
    // seconds of nothing happening.
    setFolders(prev => prev.filter(f => f.id !== target.id))
    folderCacheRef.current.clear()

    try {
      const res = await fetch(`${foldersApi}/${target.id}?mode=${mode}`, { method: 'DELETE' })
      if (!res.ok) {
        // The server has something worth reading here — it refuses the delete
        // when a file couldn't be moved out first, rather than losing it.
        // Throwing that away was why a folder could come back on refresh with
        // no explanation at all.
        const message = await res.text().catch(() => '')
        throw new Error(message || `Map verwijderen mislukt (${res.status}).`)
      }
      setFolderToDelete(null)
      loadData()
    } catch (err) {
      setFolders(prev => prev.some(f => f.id === target.id) ? prev : [...prev, target])
      setDeleteError(err instanceof Error ? err.message : 'Map verwijderen mislukt.')
      setFolderToDelete(null)
      // A refused delete can still have moved files up to this folder before
      // it stopped — the server does that first, on purpose, so nothing is
      // lost with the folder. Reload so you see where things actually are
      // instead of having to refresh to find out.
      loadData()
    }
    setDeletingFolderBusy(false)
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

  // A file dragged out of this folder leaves it — so take it off the list at
  // once instead of waiting for the server and then reloading the whole
  // listing. The move still has to succeed; if it doesn't, the row comes back
  // and says why, which is the only honest way to show something early.
  async function moveFileTo(fileId: string, targetFolderId: string | null, targetLabel: string) {
    const removed = files.find(f => f.id === fileId)
    if (!removed) return

    const cameFrom = removed.folder_id ?? null
    const cameFromKey = listingKeyRef.current

    setFiles(prev => prev.filter(f => f.id !== fileId))
    setMoveError(null)
    setMoveToast(null)
    // The listing we just edited by hand is no longer what the cache holds.
    folderCacheRef.current.delete(cameFromKey)

    try {
      const res = await fetch(`${filesApi}?id=${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      })
      if (!res.ok) throw new Error(`Verplaatsen mislukt (${res.status}).`)

      // Both folders changed, so neither stored listing can be trusted.
      folderCacheRef.current.clear()
      // Says where it went, and offers the way back — the row vanishing is
      // fast but tells you nothing on its own.
      setMoveToast({ file: removed, cameFrom, cameFromKey, targetLabel })
    } catch (err) {
      setFiles(prev => prev.some(f => f.id === fileId) ? prev : [...prev, removed])
      setMoveError(err instanceof Error ? err.message : 'Verplaatsen mislukt.')
    }
  }

  async function undoMove() {
    const toast = moveToast
    if (!toast || undoing) return
    setUndoing(true)
    setMoveError(null)

    try {
      const res = await fetch(`${filesApi}?id=${toast.file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: toast.cameFrom }),
      })
      if (!res.ok) throw new Error(`Terugzetten mislukt (${res.status}).`)

      folderCacheRef.current.clear()
      // Only put the row back if that folder is still what's on screen —
      // undoing from somewhere else shouldn't make a file appear there.
      if (listingKeyRef.current === toast.cameFromKey) {
        setFiles(prev => prev.some(f => f.id === toast.file.id) ? prev : [...prev, toast.file])
      }
      setMoveToast(null)
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Terugzetten mislukt.')
    }
    setUndoing(false)
  }

  async function onDropOnFolder(e: React.DragEvent, targetFolderId: string) {
    e.preventDefault()
    markDropped()
    const fileId = e.dataTransfer.getData('fileId')
    setDragOverFolderId(null)
    setDraggingFileId(null)
    if (!fileId) return
    const target = folders.find(f => f.id === targetFolderId)
    await moveFileTo(fileId, targetFolderId, target?.name ?? 'de map')
  }

  // Drop on breadcrumb parent = move back to that folder level
  async function onDropOnBreadcrumb(e: React.DragEvent, targetFolderId: string | null, targetLabel: string) {
    e.preventDefault()
    markDropped()
    const fileId = e.dataTransfer.getData('fileId')
    setDragOverRoot(false)
    setDraggingFileId(null)
    if (!fileId) return
    await moveFileTo(fileId, targetFolderId, targetLabel)
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
    const tooBig = entries.filter(e => e.file.size > MAX_UPLOAD_BYTES)
    const ok = entries.filter(e => e.file.size <= MAX_UPLOAD_BYTES)
    setUploadError(tooBig.length ? `${tooBig.length} bestand${tooBig.length !== 1 ? 'en zijn' : ' is'} groter dan ${MAX_UPLOAD_LABEL} en werd${tooBig.length !== 1 ? 'en' : ''} overgeslagen.` : null)
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

          // 4. Make the thumbnail here in the browser and send it up. Drive
          // stops rendering previews above a certain size, and the bytes are
          // already on this machine, so this costs no download at all. Video
          // always gets one (its frame is never something Drive picks well);
          // images only once they're big enough that Drive may give up.
          // Strictly best-effort: a format the browser can't decode, or a
          // failed POST, leaves the file uploaded and falls back to whatever
          // Drive manages on its own.
          const category = getFileCategory(fileExtOf(entry.file.name))
          const needsPoster = category === 'video'
            || (category === 'image' && entry.file.size >= IMAGE_POSTER_MIN_BYTES)

          if (needsPoster) {
            try {
              const record = await finalizeRes.json()
              const poster = category === 'video'
                ? await extractVideoPoster(entry.file)
                : await extractImagePoster(entry.file)
              if (poster && record?.id) {
                const body = new FormData()
                body.append('id', record.id)
                body.append('poster', poster, 'poster.jpg')
                await fetch(`${filesApi}/poster`, { method: 'POST', body })
              }
            } catch (err) {
              console.error('Kon voorbeeld niet maken:', err)
            }
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

  // Points at /share rather than straight at this page, so the link-preview
  // card in WhatsApp, Slack or Discord can say what it opens. Someone who's
  // signed in is forwarded through without noticing; someone who isn't gets a
  // card and a login button instead of a redirect to a login page that has
  // forgotten where they were going.
  //
  // Built from the address bar rather than a hardcoded host, so it stays
  // right on preview deployments and whatever domain this ends up on.
  function shareUrl(params: Record<string, string>) {
    const url = new URL(window.location.href)
    url.pathname = '/share'
    url.search = ''
    // Where to land once signed in — the page this manager is mounted on.
    url.searchParams.set('path', window.location.pathname)
    // Which tables hold the names shown on the card.
    url.searchParams.set('kind', foldersApi.includes('/sporthouse/') ? 'sporthouse' : 'client')
    url.searchParams.set(scopeKey === 'section' ? 'section' : 'client', scopeValue)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url.toString()
  }

  // Copied in two flavours at once: the bare URL, and the same URL wrapped in
  // an anchor with the file or folder name as its text.
  //
  // Paste into Slack, Teams, a mail or Notion and you get the word "Talks" as
  // a clickable link instead of 132 characters of UUID. Paste somewhere that
  // only takes plain text — WhatsApp, a terminal — and the clipboard hands
  // over the URL instead, which is exactly right there.
  //
  // The label is a filename, so it goes through escapeHtml: a name with an
  // ampersand or a tag in it would otherwise produce markup we never meant.
  // The href needs no escaping of its own — it comes out of `new URL()`, so
  // it can't carry a quote that would break out of the attribute.
  async function copyLink(url: string, label: string) {
    const html = `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`

    try {
      // Built before any await, since Safari only honours a clipboard write
      // that happens within the gesture that triggered it.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([url], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(url)
      }
      setCopiedLabel(label)
      return
    } catch { /* fall through to the plain-text attempt below */ }

    // Some browsers refuse write() but allow writeText(); a plain URL on the
    // clipboard is worth more than a failure message.
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLabel(label)
    } catch {
      // Clipboard access can be refused outright (an insecure origin, or a
      // browser that wants a more direct gesture). Saying so beats a button
      // that looks like it worked.
      setCopyError('Kon de link niet kopiëren. Kopieer hem uit de adresbalk.')
    }
  }

  async function handleDownload(file: FileRecord) {
    setDownloadingId(file.id)
    setDownloadError(null)
    try {
      const res = await fetch(`${filesApi}?id=${file.id}`)
      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.url) throw new Error(result?.error ?? 'Kon de download niet starten.')

      // Handed to the browser to fetch, instead of pulled into memory here
      // first. It used to read the whole file into a Blob before offering it
      // — which for a 1 GB video on a phone means holding a gigabyte in the
      // tab, no progress anywhere, and a failure that showed as nothing at
      // all. The browser streams it to disk, shows it in its own downloads,
      // and can resume if the connection drops. The response already carries
      // Content-Disposition, so it saves rather than navigates.
      const a = document.createElement('a')
      a.href = result.url
      a.download = result.filename
      a.rel = 'noopener'
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Kon de download niet starten.')
    }
    setDownloadingId(null)
  }

  async function handleDeleteFile(fileId: string) {
    const removed = files.find(f => f.id === fileId)
    setDeletingId(fileId)
    setDeleteError(null)

    // Gone from the list at once; the request still has to move it to the
    // trash in Drive, which is what the wait used to be.
    setFiles(prev => prev.filter(f => f.id !== fileId))
    folderCacheRef.current.delete(listingKeyRef.current)

    try {
      const res = await fetch(`${filesApi}?id=${fileId}`, { method: 'DELETE' })
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(result?.error ?? `Verwijderen mislukt (${res.status}).`)
      // Still surfaced: the file is out of the app but Drive didn't follow.
      setDeleteWarning(result?.warning ?? null)
    } catch (err) {
      if (removed) setFiles(prev => prev.some(f => f.id === fileId) ? prev : [...prev, removed])
      setDeleteError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
    }
    setDeletingId(null)
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

  type FolderContents = {
    folderName: string
    files: { id: string; filename: string; relativePath: string; fileSize?: number }[]
    driveFolderId?: string | null
  }

  async function fetchFolderContents(folderId: string): Promise<FolderContents> {
    const res = await fetch(`${foldersApi}/${folderId}/contents`)
    if (!res.ok) throw new Error('Kon mapinhoud niet ophalen.')
    return res.json()
  }

  // Shown instead of starting a download that would run the tab out of memory.
  function tooLargeToZip(totalBytes: number, driveFolderId?: string | null) {
    const size = formatSize(totalBytes)
    setZipError(
      driveFolderId
        ? `Deze selectie is ${size} en wordt hier in het geheugen ingepakt, wat boven ${MAX_ZIP_LABEL} vastloopt. Download de map rechtstreeks uit Google Drive, of selecteer minder bestanden tegelijk.`
        : `Deze selectie is ${size} en wordt hier in het geheugen ingepakt, wat boven ${MAX_ZIP_LABEL} vastloopt. Selecteer minder bestanden tegelijk.`
    )
    setZipDriveUrl(driveFolderId ? driveFolderUrl(driveFolderId) : null)
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
    setZipDriveUrl(null)
    try {
      // Weigh the whole job before fetching a single byte. The folder listings
      // are metadata only, so this costs nothing compared to the download it
      // might prevent.
      const pickedFiles = Array.from(selectedIds)
        .map(id => files.find(f => f.id === id))
        .filter((f): f is FileRecord => !!f)

      const folderContents = await Promise.all(
        Array.from(selectedFolderIds).map(folderId => fetchFolderContents(folderId))
      )

      const totalBytes =
        pickedFiles.reduce((sum, f) => sum + (f.file_size ?? 0), 0) +
        folderContents.reduce((sum, c) => sum + c.files.reduce((s, f) => s + (f.fileSize ?? 0), 0), 0)

      if (totalBytes > MAX_ZIP_BYTES) {
        // Only point at Drive when exactly one folder is involved; with a mixed
        // selection there's no single folder that stands for the whole job.
        const single = selectedIds.size === 0 && folderContents.length === 1 ? folderContents[0].driveFolderId : null
        tooLargeToZip(totalBytes, single)
        setDownloadingZip(false)
        return
      }

      const zip = new JSZip()

      await Promise.all(pickedFiles.map(async (file) => {
        const blob = await fetch(`${filesApi}/download?id=${file.id}`).then(r => r.blob())
        zip.file(file.filename, blob)
      }))

      await Promise.all(folderContents.map(async ({ folderName, files: folderFiles }) => {
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
    setZipDriveUrl(null)
    try {
      const { folderName, files: folderFiles, driveFolderId } = await fetchFolderContents(currentFolderId)

      const totalBytes = folderFiles.reduce((sum, f) => sum + (f.fileSize ?? 0), 0)
      if (totalBytes > MAX_ZIP_BYTES) {
        tooLargeToZip(totalBytes, driveFolderId)
        setDownloadingZip(false)
        return
      }

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
    const responses = await Promise.all(
      ids.map(async id => {
        const r = await fetch(`${filesApi}?id=${id}`, { method: 'DELETE' })
        return { ok: r.ok, body: await r.json().catch(() => null) }
      })
    )
    const failed = responses.filter(r => !r.ok).length
    setDeleteError(failed > 0
      ? `${failed} van de ${ids.length} bestanden konden niet verwijderd worden en staan er nog.`
      : null)
    const results = responses.map(r => r.body)
    const warnings = results.filter(r => r?.warning).length
    setDeleteWarning(warnings > 0 ? `${warnings} van de ${ids.length} bestanden werden verwijderd uit de app, maar niet volledig naar de prullenbak in Drive verplaatst.` : null)
    setSelectedIds(new Set())
    loadData()
    setBulkDeleting(false)
  }

  async function handleRestore(fileId: string) {
    setRestoringId(fileId)
    setTrashError(null)
    try {
      const res = await fetch(`${filesApi}/restore?id=${fileId}`, { method: 'POST' })
      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || `Terugzetten mislukt (${res.status}).`)
      }
    } catch (err) {
      setTrashError(err instanceof Error ? err.message : 'Terugzetten mislukt.')
    }
    await loadTrash()
    setRestoringId(null)
  }

  async function handlePurge(fileId: string) {
    if (!confirm('Definitief verwijderen? Dit bestand kan hierna niet meer teruggezet worden.')) return
    setPurgingId(fileId)
    setTrashError(null)
    try {
      const res = await fetch(`${filesApi}/purge?id=${fileId}`, { method: 'DELETE' })
      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || `Definitief verwijderen mislukt (${res.status}).`)
      }
    } catch (err) {
      setTrashError(err instanceof Error ? err.message : 'Definitief verwijderen mislukt.')
    }
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

  // Files the preview modal can step through with the arrow keys: the same
  // list the previewed file was opened from, in the order shown on screen,
  // minus anything Drive can't render. Falls back to the global search
  // results when the preview was opened from there rather than the folder.
  const isPreviewableFile = (f: FileRecord) => f.storage_provider === 'drive' && !!f.drive_file_id
  const previewSource = previewFile && filteredFiles.some(f => f.id === previewFile.id)
    ? filteredFiles
    : filteredGlobal
  const previewList = previewSource.filter(isPreviewableFile)
  const previewIndex = previewFile ? previewList.findIndex(f => f.id === previewFile.id) : -1

  // Fetch the previews either side of the current one ahead of time. Stepping
  // through a folder is overwhelmingly sequential, so by the time the arrow
  // key is pressed the next image is usually already in the browser cache and
  // appears with no visible load at all.
  useEffect(() => {
    if (previewIndex < 0) return
    for (const neighbour of [previewList[previewIndex - 1], previewList[previewIndex + 1]]) {
      if (neighbour && canPreviewAsImage(neighbour.file_type)) {
        new Image().src = `${filesApi}/thumbnail?id=${neighbour.id}`
      }
    }
    // previewList is rebuilt on every render; keying the effect on the id of
    // each neighbour instead keeps it to one prefetch per actual move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIndex, previewList[previewIndex - 1]?.id, previewList[previewIndex + 1]?.id, filesApi])

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
                onDrop={isDropTarget ? (e) => onDropOnBreadcrumb(e, crumb.id, crumb.name) : undefined}
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
        {loading && shownFor === listingKey && (
          <Loader2 size={12} className="animate-spin text-zinc-600 ml-2" aria-label="Bezig met verversen" />
        )}
      </nav>

      {/* Toolbar — search gets its own full-width row, the action buttons share the row below */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="relative w-full sm:max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Zoeken in deze map..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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

          <div className="flex items-center gap-1.5 flex-nowrap scroll-x pb-1">
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
                className={`px-2.5 py-1 rounded-md text-xs transition-colors flex-shrink-0 ${
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
        <div className="mb-5">
          <Notice tone="warning" onDismiss={() => setDeleteWarning(null)}>{deleteWarning}</Notice>
        </div>
      )}

      {moveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-4 py-2.5 rounded-xl shadow-2xl"
          style={{ background: '#232323', border: '1px solid rgba(255,255,255,0.14)' }}>
          <p className="text-xs text-zinc-300">
            <span className="text-zinc-100">{moveToast.file.filename}</span> verplaatst naar {moveToast.targetLabel}
          </p>
          <button
            onClick={undoMove}
            disabled={undoing}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
          >
            {undoing ? 'Bezig…' : 'Ongedaan maken'}
          </button>
          <button onClick={() => setMoveToast(null)} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {renameError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => setRenameError(null)}>{renameError} De oude naam staat er weer.</Notice>
        </div>
      )}

      {deleteError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => setDeleteError(null)}>{deleteError}</Notice>
        </div>
      )}

      {moveError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => setMoveError(null)}>{moveError} Het bestand staat weer waar het stond.</Notice>
        </div>
      )}

      {copiedLabel && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-4 py-2.5 rounded-xl shadow-2xl"
          style={{ background: '#232323', border: '1px solid rgba(255,255,255,0.14)' }}>
          <p className="text-xs text-zinc-300">
            Link naar <span className="text-zinc-100">{copiedLabel}</span> gekopieerd
          </p>
          <button onClick={() => setCopiedLabel(null)} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {copyError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => setCopyError(null)}>{copyError}</Notice>
        </div>
      )}

      {downloadError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => setDownloadError(null)}>{downloadError}</Notice>
        </div>
      )}

      {zipError && (
        <div className="mb-5">
          <Notice tone="error" onDismiss={() => { setZipError(null); setZipDriveUrl(null) }}>
            {zipError}
            {zipDriveUrl && (
              <a href={zipDriveUrl} target="_blank" rel="noopener noreferrer"
                className="block mt-1.5 text-red-300 underline underline-offset-2 hover:text-red-200">
                Map openen in Google Drive →
              </a>
            )}
          </Notice>
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
          {createFolderError && <Notice tone="error">{createFolderError}</Notice>}
        </div>
      )}

      {/* ── Prullenbak ── */}
      {showTrash && (
        <div className="mb-6">
          {trashError && (
            <div className="mb-4">
              <Notice tone="error" onDismiss={() => setTrashError(null)}>{trashError}</Notice>
            </div>
          )}
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
                        <FileTile file={file} icon={Icon} color={color} filesApi={filesApi} />
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
                      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {isText && canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(file) }}
                            title="Bewerken"
                            className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
                          disabled={downloadingId === file.id}
                          title="Download"
                          className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
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
                            className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
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
      {!showTrash && !isGlobalSearch && loading && shownFor !== listingKey ? (
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
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-3 mb-5">
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
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 sm:top-2 sm:translate-y-0 z-10">
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
                        className={`w-full flex items-center sm:flex-col gap-3 sm:gap-2.5 py-3 pl-9 pr-9 sm:p-4 rounded-xl transition-all text-left sm:text-center border-2 ${
                          isOver
                            ? 'border-emerald-500 bg-emerald-950/30 sm:scale-105'
                            : isFolderSelected
                              ? 'border-emerald-700 bg-emerald-950/20'
                              : isFolderPreviewSelected
                                ? 'border-zinc-500 bg-zinc-700/50'
                                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/60'
                        }`}
                      >
                        {isOver
                          ? <FolderOpen className="text-emerald-400 w-6 h-6 sm:w-9 sm:h-9 flex-shrink-0" />
                          : <Folder className="text-amber-400 w-6 h-6 sm:w-9 sm:h-9 flex-shrink-0" />
                        }
                        <span className="text-sm sm:text-xs text-white font-medium leading-snug truncate sm:whitespace-normal sm:line-clamp-2 flex-1 min-w-0 sm:w-full">
                          {folder.name}
                        </span>
                        {isOver && (
                          <span className="text-xs text-emerald-400 flex-shrink-0">Loslaten om te verplaatsen</span>
                        )}
                      </button>
                    )}

                    {/* 3-dot menu */}
                    {renamingId !== folder.id && (
                      <div className={`absolute right-2 top-1/2 -translate-y-1/2 sm:top-2 sm:translate-y-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10 ${canManage ? '' : 'hidden'}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === folder.id ? null : folder.id)
                          }}
                          aria-label="Meer opties"
                          className="tap-target p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all"
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
                                copyLink(shareUrl({ folder: folder.id }), folder.name)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                            >
                              <Link2 size={11} /> Link kopiëren
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
                      <FileTile file={file} icon={Icon} color={color} filesApi={filesApi} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {renamingId === file.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onBlur={() => handleRenameFile(file)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFile(file)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-600"
                        />
                      ) : (
                        <p className="text-sm font-medium text-white truncate">{file.filename}</p>
                      )}
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

                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {isText && canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(file) }}
                          title="Inhoud bewerken"
                          className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 transition-all"
                        >
                          <FileText size={13} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenamingId(file.id)
                            setRenameValue(file.filename)
                          }}
                          title="Hernoemen"
                          className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyLink(
                            shareUrl({ ...(currentFolderId ? { folder: currentFolderId } : {}), file: file.id }),
                            file.filename
                          )
                        }}
                        title="Link naar dit bestand kopiëren"
                        className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                      >
                        <Link2 size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
                        disabled={downloadingId === file.id}
                        title="Download"
                        className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
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
                          className="tap-target p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
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
                Meerdere bestanden tegelijk mogelijk — max {MAX_UPLOAD_LABEL} per bestand ·{' '}
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
              height: '90dvh',
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
          thumbnailHref={canPreviewAsImage(previewFile.file_type) ? `${filesApi}/thumbnail?id=${previewFile.id}` : undefined}
          streamHref={isHandheld && getFileCategory(previewFile.file_type) === 'video'
            ? `${filesApi}/download?id=${previewFile.id}&inline=1`
            : undefined}
          onClose={() => setPreviewFile(null)}
          onPrev={previewIndex > 0 ? () => setPreviewFile(previewList[previewIndex - 1]) : undefined}
          onNext={previewIndex >= 0 && previewIndex < previewList.length - 1 ? () => setPreviewFile(previewList[previewIndex + 1]) : undefined}
          position={previewIndex >= 0 ? { index: previewIndex, total: previewList.length } : undefined}
        />
      )}
      </div>
    </div>
  )
}
