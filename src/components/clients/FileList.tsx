'use client'

import { useState } from 'react'
import { FileRecord } from '@/types/database'
import {
  Search, Trash2, Download, Loader2, Eye,
  FileText, FileImage, FileVideo, FileAudio,
  FileArchive, File, FileCode, FileType2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DrivePreviewModal } from '@/components/shared/DrivePreview'

interface Props {
  files: FileRecord[]
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

export default function FileList({ files, currentUserEmail }: Props) {
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null)
  const router = useRouter()

  const filtered = files.filter(f =>
    f.filename.toLowerCase().includes(search.toLowerCase()) ||
    (f.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  async function handleDownload(file: FileRecord) {
    setDownloadingId(file.id)
    try {
      const response = await fetch(`/api/files?id=${file.id}`)
      const result = await response.json()
      if (!result.url) throw new Error('Geen URL ontvangen')

      // Fetch as blob so the browser downloads instead of previewing (works cross-origin)
      const fileResponse = await fetch(result.url)
      const blob = await fileResponse.blob()
      const objectUrl = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = objectUrl
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('Download fout:', err)
    }
    setDownloadingId(null)
  }

  async function handleDelete(fileId: string) {
    setDeletingId(fileId)
    await fetch(`/api/files?id=${fileId}`, { method: 'DELETE' })
    router.refresh()
    setDeletingId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white">
          Bestanden{' '}
          <span className="text-zinc-500 font-normal">({files.length})</span>
        </h3>
      </div>

      {files.length > 0 && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Zoek op naam of beschrijving..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          {files.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">Nog geen bestanden geüpload.</p>
              <p className="text-xs text-zinc-600">Upload een bestand via het veld hierboven.</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Geen bestanden gevonden voor &ldquo;{search}&rdquo;.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((file) => {
            const { icon: Icon, color, bg } = getFileIcon(file.file_type)
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg group hover:border-zinc-700 transition-colors"
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={15} className={color} />
                </div>

                {/* Info */}
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
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {file.storage_provider === 'drive' && file.drive_file_id && (
                    <button
                      onClick={() => setPreviewFile(file)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                      title="Bekijken"
                    >
                      <Eye size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === file.id}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                    title="Download"
                  >
                    {downloadingId === file.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />
                    }
                  </button>
                  {currentUserEmail && file.uploaded_by === currentUserEmail && (
                    <button
                      onClick={() => handleDelete(file.id)}
                      disabled={deletingId === file.id}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-all"
                      title="Verwijder"
                    >
                      {deletingId === file.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {previewFile?.drive_file_id && (
        <DrivePreviewModal
          driveFileId={previewFile.drive_file_id}
          title={previewFile.filename}
          webViewLink={previewFile.web_view_link}
          downloadHref={`/api/files/download?id=${previewFile.id}`}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
