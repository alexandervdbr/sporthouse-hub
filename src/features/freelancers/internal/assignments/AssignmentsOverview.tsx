'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ErrorLine, buttonCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { EmptyState, StatusPill } from '../ui'
import { relativeDeadline } from '../format'
import { reviewOf, type AssignmentRow } from '../types'
import { GROUPS, groupOf } from '../list/filter'

// Tabblad Opdrachten: over alle freelancers heen. Bovenaan wat op ons wacht.
export default function AssignmentsOverview({ onOpen, canManage, reloadKey }: { onOpen: (id: string) => void; canManage: boolean; reloadKey: number }) {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null)
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    internalApi.assignments().then(r => { if (alive) setRows(r) }).catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [reloadKey])

  if (error) return <ErrorLine>{error}</ErrorLine>
  if (!rows) return <Loader2 className="mx-auto mt-10 animate-spin text-zinc-500" aria-label="Laden" />

  const groups = GROUPS.map(g => ({ ...g, items: rows.filter(r => groupOf(r, now) === g.key) })).filter(g => g.items.length)
  if (!groups.length) {
    return <EmptyState title="Geen lopende opdrachten" action={canManage ? <Link href="/freelancers/opdrachten/nieuw" className={buttonCls('primary')}>+ Nieuwe opdracht</Link> : undefined}>Maak een opdracht en deel ze met een freelancer.</EmptyState>
  }

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <section key={g.key} aria-labelledby={`groep-${g.key}`}>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 id={`groep-${g.key}`} className={`text-xs font-semibold uppercase tracking-wider ${g.key === 'wacht' ? 'text-amber-300' : 'text-zinc-500'}`}>{g.title}</h2>
            <span className="text-xs text-zinc-600">{g.items.length}{g.hint ? ` · ${g.hint}` : ''}</span>
          </div>
          <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
            {g.items.map(a => {
              const d = a.deadline ? relativeDeadline(a.deadline) : null
              const open = a.status === 'gedeeld' || a.status === 'geaccepteerd'
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a.id)}
                    className="grid w-full min-h-[52px] grid-cols-1 gap-1 px-3 py-2.5 text-left hover:bg-zinc-900/60 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-100">{a.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{[a.freelancer?.name, a.client?.name ?? a.client_name].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      {d && open && <span className={d.late ? 'font-medium text-red-400' : 'text-zinc-400'}>{d.text}</span>}
                      {a.status === 'afgerond' && !reviewOf(a) && <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">Review ontbreekt</span>}
                      <StatusPill status={a.status} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
