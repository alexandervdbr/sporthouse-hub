'use client'

import { Search, Square, HelpCircle } from 'lucide-react'
import SearchModal from '@/components/search/SearchModal'
import { useRecording } from '@/contexts/RecordingContext'
import { useTour } from '@/contexts/TourContext'
import { useRouter } from 'next/navigation'

const MAX_DURATION = 90 * 60

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function RecordingBar() {
  const recording = useRecording()
  const router    = useRouter()

  if (recording.stage !== 'recording') return null

  const remaining   = MAX_DURATION - recording.duration
  const isNearLimit = remaining <= 300 // waarschuw binnen 5 min van limiet

  function handleStop() {
    recording.stopRecording()
    if (recording.clientId) {
      router.push(`/clients/${recording.clientId}/meetings`)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
      style={{
        background: 'rgba(127,29,29,0.25)',
        border: '1px solid rgba(185,28,28,0.3)',
      }}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-50" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>

      <span className="text-xs text-red-400 font-medium">
        {recording.clientName && <span className="text-red-300">{recording.clientName} · </span>}
        {formatDuration(recording.duration)}
        {isNearLimit && (
          <span className="ml-2 text-red-500">· nog {formatDuration(remaining)}</span>
        )}
      </span>

      <button
        onClick={handleStop}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-red-400 hover:text-white transition-colors"
        style={{ background: 'rgba(185,28,28,0.3)', border: '1px solid rgba(185,28,28,0.4)' }}
      >
        <Square size={9} fill="currentColor" />
        Stop
      </button>
    </div>
  )
}

export default function TopBar() {
  const { start } = useTour()

  return (
    <>
      <SearchModal />
      <div className="flex-shrink-0 h-12 border-b border-zinc-700/60 bg-zinc-900/60 flex items-center justify-between px-6 gap-4">
        <RecordingBar />

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/70 transition-all"
          >
            <Search size={12} />
            <span>Zoeken…</span>
            <kbd className="ml-1 text-zinc-500 font-sans">⌘K</kbd>
          </button>

          <button
            data-tour="tour-button"
            onClick={start}
            title="Platform rondleiding"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/70 transition-all"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      </div>
    </>
  )
}
