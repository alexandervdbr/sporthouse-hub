'use client'

import { useState, useEffect } from 'react'
import { Download, X, Film, ImageIcon } from 'lucide-react'

// Drive generates thumbnails asynchronously after upload, so the URL can be
// briefly unresolvable right after a file lands — retry a few times with
// backoff before giving up and showing the icon fallback.
const THUMB_RETRY_DELAYS = [3000, 6000, 12000]

export function DriveThumbnail({ src, alt, video }: { src: string; alt: string; video: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed]   = useState(false)

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-700">
        {video ? <Film size={28} /> : <ImageIcon size={28} />}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}cb=${attempt}`}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => {
        if (attempt < THUMB_RETRY_DELAYS.length) {
          setTimeout(() => setAttempt(a => a + 1), THUMB_RETRY_DELAYS[attempt])
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

// In-platform preview for a Drive file — embeds Google's own preview iframe
// (handles video seeking/streaming for us) inside a lightbox, so users never
// leave the app just to look at something they uploaded.
export function DrivePreviewModal({ driveFileId, title, webViewLink, downloadHref, onClose }: {
  driveFileId: string
  title: string
  webViewLink?: string | null
  downloadHref?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', maxHeight: '85vh' }}>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-sm font-medium text-zinc-200 truncate pr-4">{title}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {downloadHref && (
              <a href={downloadHref} download
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                <Download size={16} />
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-black" style={{ minHeight: '60vh' }}>
          <iframe
            src={`https://drive.google.com/file/d/${driveFileId}/preview`}
            className="w-full h-full"
            style={{ minHeight: '60vh' }}
            allow="autoplay"
          />
        </div>

        {webViewLink && (
          <div className="px-5 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <a href={webViewLink} target="_blank" rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Openen in Google Drive →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
