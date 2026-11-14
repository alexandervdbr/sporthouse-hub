'use client'

import type { Card, Me } from './api'
import AvailabilityCard from './AvailabilityCard'
import AssignmentCard from './AssignmentCard'

// Startpagina: "Hoi [voornaam]", beschikbaarheid, en de opdrachten in
// secties die alleen verschijnen als ze iets bevatten.
const SECTIONS: { title: string; match: (a: Card) => boolean }[] = [
  { title: 'Nieuw voor jou', match: a => a.status === 'gedeeld' },
  { title: 'Bezig', match: a => a.status === 'geaccepteerd' },
  { title: 'Opgeleverd', match: a => a.status === 'opgeleverd' },
  { title: 'Recent afgerond', match: a => a.status === 'afgerond' || a.status === 'geweigerd' },
]

export default function Home({ me, onOpen }: { me: Me; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Hoi {me.firstName || 'daar'}</h1>
      <AvailabilityCard initial={me.availability} initialFrom={me.availableFrom} />

      {me.assignments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-base text-zinc-400">
          Er staan momenteel geen opdrachten voor je klaar.
        </p>
      ) : SECTIONS.map(s => {
        const items = me.assignments.filter(s.match)
        if (!items.length) return null
        return (
          <section key={s.title} aria-label={s.title}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">{s.title}</h2>
            <div className="space-y-2">{items.map(a => <AssignmentCard key={a.id} a={a} onOpen={() => onOpen(a.id)} />)}</div>
          </section>
        )
      })}
    </div>
  )
}
