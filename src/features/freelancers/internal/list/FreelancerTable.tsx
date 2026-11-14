'use client'

import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import { Avatar, AvailabilityDot, Chip } from '../ui'
import { FREELANCER_STATUS, availabilitySource, rateText, ratingText, shortDate } from '../format'
import type { Freelancer } from '../types'

// Desktop: een compacte tabel, vertrouwd voor wie uit een spreadsheet komt.
// Gsm: kaarten met de belangrijkste gegevens en snelle bel- en mailknoppen.
// Een klik op een rij of kaart opent het profiel.

function Disciplines({ f, labels }: { f: Freelancer; labels: Record<string, string> }) {
  return <div className="flex flex-wrap gap-1">{f.disciplines.map(d => <Chip key={d}>{labels[d] ?? d}</Chip>)}</div>
}

function Availability({ f }: { f: Freelancer }) {
  const src = availabilitySource(f)
  return (
    <div className="text-sm text-zinc-300">
      <AvailabilityDot value={f.availability} title={src} />
      {f.available_from && f.availability !== 'beschikbaar' && <div className="text-xs text-zinc-500">vanaf {shortDate(f.available_from)}</div>}
    </div>
  )
}

export function FreelancerTable({ list, labels }: { list: Freelancer[]; labels: Record<string, string> }) {
  return (
    <table className="w-full table-fixed text-left text-sm">
      <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
        <tr className="border-b border-zinc-800">
          <th className="w-[22%] py-2 pr-3 font-medium">Naam</th>
          <th className="w-[20%] py-2 pr-3 font-medium">Disciplines</th>
          <th className="w-[10%] py-2 pr-3 font-medium">Status</th>
          <th className="w-[13%] py-2 pr-3 font-medium">Beschikbaarheid</th>
          <th className="w-[14%] py-2 pr-3 font-medium">Beoordeling</th>
          <th className="w-[11%] py-2 pr-3 font-medium">Tarief</th>
          <th className="w-[6%] py-2 pr-3 font-medium">Laatste</th>
          <th className="w-[4%] py-2 font-medium text-right" title="Lopende opdrachten">Lop.</th>
        </tr>
      </thead>
      <tbody>
        {list.map(f => (
          <tr key={f.id} className="group border-b border-zinc-900 align-top hover:bg-zinc-900/60">
            <td className="py-2.5 pr-3">
              <Link href={`/freelancers/${f.id}`} className="flex min-w-0 items-center gap-2.5 font-medium text-zinc-100 focus:outline-none focus-visible:underline">
                <Avatar name={f.name} url={f.avatar_url} size={28} />
                <span className="truncate">{f.name}</span>
              </Link>
            </td>
            <td className="py-2.5 pr-3"><Disciplines f={f} labels={labels} /></td>
            <td className="py-2.5 pr-3 text-zinc-300">{FREELANCER_STATUS[f.status]}</td>
            <td className="py-2.5 pr-3"><Availability f={f} /></td>
            <td className="py-2.5 pr-3 text-zinc-300">{ratingText(f) || <span className="text-zinc-600">—</span>}</td>
            <td className="py-2.5 pr-3 text-zinc-300 break-words">{rateText(f) || <span className="text-zinc-600">—</span>}</td>
            <td className="py-2.5 pr-3 text-zinc-400">{f.stats?.last_assignment_at ? shortDate(f.stats.last_assignment_at) : '—'}</td>
            <td className="py-2.5 text-right text-zinc-300">{f.stats?.active_assignments || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function FreelancerCards({ list, labels }: { list: Freelancer[]; labels: Record<string, string> }) {
  return (
    <ul className="space-y-2">
      {list.map(f => (
        <li key={f.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <Link href={`/freelancers/${f.id}`} className="flex gap-3 px-4 pt-3 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50 rounded-2xl">
            <Avatar name={f.name} url={f.avatar_url} size={40} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-zinc-100">{f.name}</span>
                <span className="flex-shrink-0 text-xs text-zinc-400">{ratingText(f)}</span>
              </div>
              <Disciplines f={f} labels={labels} />
              <Availability f={f} />
            </div>
          </Link>
          {(f.phone || f.email) && (
            <div className="flex border-t border-zinc-800">
              {f.phone && <a href={`tel:${f.phone.replace(/\s+/g, '')}`} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 text-sm text-zinc-300 hover:bg-zinc-800/60"><Phone size={15} aria-hidden /> Bellen</a>}
              {f.email && <a href={`mailto:${f.email}`} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 border-l border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800/60"><Mail size={15} aria-hidden /> Mailen</a>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
