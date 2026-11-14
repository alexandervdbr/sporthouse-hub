import { Eye } from 'lucide-react'
import { ASSIGNMENT_STATUS, ago } from '../format'
import type { AssignmentDetail } from '../types'

// De activiteitenlog. Wat de freelancer op zijn link ziet, is gemarkeerd.
function describe(e: AssignmentDetail['events'][number]): string {
  const who = e.actor_type === 'freelancer' ? 'Freelancer' : e.actor_type === 'systeem' ? 'Systeem' : 'Team'
  if (e.kind === 'status' && e.to_status) {
    if (e.from_status === 'opgeleverd' && e.to_status === 'geaccepteerd') return `${who} stuurde terug met feedback`
    return `${who}: ${ASSIGNMENT_STATUS[e.to_status]?.label.toLowerCase() ?? e.to_status}`
  }
  if (e.kind === 'bekeken') return 'Freelancer opende de opdracht'
  if (e.kind === 'bestand') return who
  if (e.kind === 'notitie') return 'Notitie'
  return who
}

export default function AssignmentActivity({ events }: { events: AssignmentDetail['events'] }) {
  if (!events.length) return <p className="text-sm text-zinc-500">Nog geen activiteit.</p>
  return (
    <ol className="space-y-2.5">
      {events.map(e => (
        <li key={e.id} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-zinc-200">{describe(e)}</span>
            <span className="flex-shrink-0 text-xs text-zinc-500">{ago(e.created_at)}</span>
          </div>
          {e.message && <p className="mt-0.5 whitespace-pre-wrap break-words text-zinc-400">{e.message}</p>}
          {e.visible_to_freelancer && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-sky-300"><Eye size={12} aria-hidden /> zichtbaar voor de freelancer</p>}
        </li>
      ))}
    </ol>
  )
}
