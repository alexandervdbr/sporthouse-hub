'use client'

import { useState, useEffect } from 'react'
import { Download, X, Film, ImageIcon, ChevronLeft, ChevronRight, Loader2, Play, Maximize2 } from 'lucide-react'

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

// In-platform preview for a Drive file.
//
// Two ways to show a file, and which one you get matters for how fast this
// feels. Google's preview iframe is a whole web app: every file costs a full
// page load, which is what made stepping through a folder with the arrow keys
// so sluggish. So when the caller can point at a rendered preview image
// (thumbnailHref), that image is shown instead — one cached request, instant
// on the way back. The iframe stays one click away for when you actually want
// Drive's viewer: playing a video, paging a PDF, zooming in.
export function DrivePreviewModal({
  driveFileId, title, webViewLink, downloadHref, thumbnailHref, isVideo, onClose, onPrev, onNext, position,
}: {
  driveFileId: string
  title: string
  webViewLink?: string | null
  downloadHref?: string
  // Our own proxy for Drive's rendered preview image. Omit it and the modal
  // behaves exactly as it always did: straight to the iframe.
  thumbnailHref?: string
  isVideo?: boolean
  onClose: () => void
  // Optional: pass these to let the viewer step through a list of files
  // (left/right arrow keys, or the chevrons). Callers that preview a single
  // file leave them out.
  onPrev?: () => void
  onNext?: () => void
  position?: { index: number; total: number }
}) {
  const [showViewer, setShowViewer] = useState(false)
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)

  // Stepping to another file reuses this same component, so every per-file
  // bit of state has to go back to its starting point — otherwise file two
  // inherits file one's loaded/failed/opened-the-viewer state. Adjusted
  // during render rather than in an effect: React re-runs this component
  // immediately with the corrected state, before anything paints, so the
  // previous file's image never briefly shows under the new file's name.
  const [renderedId, setRenderedId] = useState(driveFileId)
  if (renderedId !== driveFileId) {
    setRenderedId(driveFileId)
    setShowViewer(false)
    setThumbLoaded(false)
    setThumbFailed(false)
  }

  // Fall back to the iframe when there's no preview image to show, or Drive
  // couldn't render one (a format it doesn't know, a file still processing).
  const useIframe = !thumbnailHref || thumbFailed || showViewer

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Don't hijack the arrow keys from a focused field, or from a browser
      // shortcut the user meant for the page (e.g. alt+left = history back).
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev() }
      if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', height: '90vh' }}>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-baseline gap-3 min-w-0 pr-4">
            <p className="text-sm font-medium text-zinc-200 truncate">{title}</p>
            {position && position.total > 1 && (
              <span className="text-xs text-zinc-500 flex-shrink-0 tabular-nums">
                {position.index + 1} / {position.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!useIframe && (
              <button onClick={() => setShowViewer(true)} aria-label="Openen in viewer" title="Openen in viewer (zoomen, bladeren)"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                <Maximize2 size={16} />
              </button>
            )}
            {downloadHref && (
              <a href={downloadHref} download aria-label="Downloaden" title="Downloaden"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                <Download size={16} />
              </a>
            )}
            <button onClick={onClose} aria-label="Sluiten" title="Sluiten" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-black relative">
          {useIframe ? (
            <iframe
              src={`https://drive.google.com/file/d/${driveFileId}/preview`}
              className="w-full h-full block"
              allow="autoplay"
            />
          ) : (
            <>
              {!thumbLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={22} className="animate-spin text-zinc-600" />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={driveFileId}
                src={thumbnailHref}
                alt={title}
                className={`w-full h-full object-contain transition-opacity duration-150 ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setThumbLoaded(true)}
                onError={() => setThumbFailed(true)}
              />
              {/* A still frame is enough to pick the right clip out of a
                  folder, but not to watch it — that needs Drive's player. */}
              {isVideo && thumbLoaded && (
                <button
                  onClick={() => setShowViewer(true)}
                  aria-label="Afspelen"
                  title="Afspelen"
                  className="absolute inset-0 flex items-center justify-center group"
                >
                  <span className="p-5 rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                    <Play size={28} fill="currentColor" />
                  </span>
                </button>
              )}
            </>
          )}

          {(onPrev || onNext) && (
            <>
              <NavButton side="left"  onClick={onPrev} label="Vorige (pijl links)"  icon={ChevronLeft} />
              <NavButton side="right" onClick={onNext} label="Volgende (pijl rechts)" icon={ChevronRight} />
            </>
          )}
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

function NavButton({ side, onClick, label, icon: Icon }: {
  side: 'left' | 'right'
  onClick?: () => void
  label: string
  icon: typeof ChevronLeft
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-3' : 'right-3'} p-2 rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80 disabled:opacity-0 disabled:pointer-events-none`}
    >
      <Icon size={22} />
    </button>
  )
}
