'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ErrorLine, buttonCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { EmptyState, Stars, StatusPill } from '../ui'
import { shortDate } from '../format'
import { reviewOf, type AssignmentRow } from '../types'

// Tabblad Opdrachten: eerst wat loopt, dan de historiek. Bij elke afgeronde
// opdracht de reviewsterren, of "Review ontbreekt".
const OPEN = ['concept', 'gedeeld', 'geaccepteerd', 'opgeleverd']

export default function ProfileAssignments({ freelancerId, canManage, onOpen, reloadKey }: {
  freelancerId: string; canManage: boolean; onOpen: (id: string) => void; reloadKey: number
}) {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    internalApi.assignments(freelancerId).then(r => { if (alive) setRows(r) }).catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [freelancerId, reloadKey])

  if (error) return <ErrorLine>{error}</ErrorLine>
  if (!rows) return <Loader2 className="mx-auto mt-8 animate-spin text-zinc-500" aria-label="Laden" />
  if (!rows.length) {
    return <EmptyState title="Nog geen opdrachten" action={canManage ? <Link href={`/freelancers/opdrachten/nieuw?freelancer=${freelancerId}`} className={buttonCls('primary')}>Nieuwe opdracht</Link> : undefined} />
  }

  const sections = [
    { title: 'Lopend', items: rows.filter(r => OPEN.includes(r.status)) },
    { title: 'Historiek', items: rows.filter(r => !OPEN.includes(r.status)) },
  ].filter(s => s.items.length)

  return (
    <div className="space-y-5">
      {sections.map(s => (
        <section key={s.title} aria-label={s.title}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{s.title}</h3>
          <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-800">
            {s.items.map(a => {
              const review = reviewOf(a)
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a.id)} className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-900/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">{a.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{[a.client?.name ?? a.client_name, a.deadline && shortDate(a.deadline), a.is_historical && 'uit de oude projecthistoriek'].filter(Boolean).join(' · ')}</span>
                    </span>
                    {a.status === 'afgerond' && (review
                      ? <Stars value={review.score} size={13} />
                      : <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">Review ontbreekt</span>)}
                    {a.status !== 'afgerond' && <StatusPill status={a.status} />}
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
