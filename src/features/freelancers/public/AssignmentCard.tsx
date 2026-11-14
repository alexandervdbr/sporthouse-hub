import { ChevronRight } from 'lucide-react'
import type { Card } from './api'
import { relativeDeadline, STATUS_TEXT } from './format'

export default function AssignmentCard({ a, onOpen }: { a: Card; onOpen: () => void }) {
  const deadline = a.deadline ? relativeDeadline(a.deadline) : null
  // Na het opleveren is de deadline niet meer de zorg van de freelancer: niet meer tonen (en zeker niet in het rood).
  const showDeadline = a.status === 'gedeeld' || a.status === 'geaccepteerd'
  return (
    <button type="button" onClick={onOpen}
      className="w-full min-h-[64px] rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left flex items-center gap-3
        hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-white break-words">{a.title}</span>
          {a.isNew && <span className="rounded-full bg-[#3A913F] px-2 py-0.5 text-xs font-semibold text-white">Nieuw</span>}
          {a.feedback && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Feedback ontvangen</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-zinc-400">
          {a.client && <span>{a.client}</span>}
          {deadline && showDeadline && (
            <span className={deadline.late ? 'font-medium text-red-400' : ''}>Deadline {deadline.text}</span>
          )}
          {!a.isNew && <span>{STATUS_TEXT[a.status] ?? a.status}</span>}
        </div>
      </div>
      <ChevronRight size={20} className="flex-shrink-0 text-zinc-500" aria-hidden />
    </button>
  )
}
