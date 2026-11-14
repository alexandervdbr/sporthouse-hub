import { Check } from 'lucide-react'
import { ASSIGNMENT_STATUS } from '../format'

// Concept → Gedeeld → Geaccepteerd → Opgeleverd → Afgerond, met geweigerd of
// geannuleerd als zijtak (rood/grijs naast de stap waar het stopte).
const STEPS = ['concept', 'gedeeld', 'geaccepteerd', 'opgeleverd', 'afgerond'] as const

export default function StatusStepper({ status, from }: { status: string; from?: string | null }) {
  const side = status === 'geweigerd' || status === 'geannuleerd'
  const at = side ? STEPS.indexOf((from ?? (status === 'geweigerd' ? 'gedeeld' : 'concept')) as typeof STEPS[number]) : STEPS.indexOf(status as typeof STEPS[number])
  return (
    <div>
      <ol className="flex items-center gap-1" aria-label="Status">
        {STEPS.map((s, i) => {
          const done = i < at || (!side && i === at && s === 'afgerond')
          const current = !side && i === at
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1" aria-current={current ? 'step' : undefined}>
              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] ${
                done ? 'border-[#3A913F] bg-[#3A913F] text-white' : current ? 'border-[#3A913F] text-[#5fbf64]' : 'border-zinc-700 text-zinc-600'}`}>
                {done ? <Check size={12} aria-hidden /> : i + 1}
              </span>
              <span className={`hidden truncate text-[11px] sm:inline ${current ? 'font-semibold text-zinc-100' : 'text-zinc-500'}`}>{ASSIGNMENT_STATUS[s].label}</span>
              {i < STEPS.length - 1 && <span className={`h-px min-w-[8px] flex-1 ${i < at ? 'bg-[#3A913F]' : 'bg-zinc-800'}`} aria-hidden />}
            </li>
          )
        })}
      </ol>
      <p className="mt-1.5 text-xs text-zinc-400 sm:hidden">{ASSIGNMENT_STATUS[status]?.label ?? status}</p>
      {side && <p className={`mt-1.5 text-xs font-medium ${status === 'geweigerd' ? 'text-red-400' : 'text-zinc-400'}`}>{ASSIGNMENT_STATUS[status].label}</p>}
    </div>
  )
}
