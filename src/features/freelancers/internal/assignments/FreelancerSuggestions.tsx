'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, ErrorLine, Select } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { Avatar, AvailabilityDot } from '../ui'
import { ratingText } from '../format'
import { sortFreelancers } from '../list/filter'
import type { Freelancer } from '../types'

// De freelancer kiezen. Eerst een lijst met suggesties: gefilterd op de
// gekozen discipline en "beschikbaar" (of tegen de deadline weer
// beschikbaar), gesorteerd op beoordeling. "AI-suggestie" zet daarboven een
// top 3 met reden en aandachtspunt. Daaronder: iedereen, voor de rest.
type Match = { id: string; rank: number; reden: string; aandachtspunt: string | null }

export default function FreelancerSuggestions({ all, value, onChange, discipline, deadline, description }: {
  all: Freelancer[]; value: string; onChange: (id: string) => void
  discipline: string; deadline: string; description: string
}) {
  const [ai, setAi] = useState<Match[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const until = deadline || new Date().toISOString().slice(0, 10)
  const active = all.filter(f => f.status !== 'inactief')
  const suggested = sortFreelancers(active.filter(f =>
    (!discipline || f.disciplines.includes(discipline))
    && (f.availability !== 'niet_beschikbaar' || (!!f.available_from && f.available_from <= until))), 'beoordeling').slice(0, 8)
  const byId = new Map(all.map(f => [f.id, f]))

  async function suggest() {
    if (!description.trim()) { setError('Vul eerst een titel of briefing in.'); return }
    setBusy(true); setError('')
    try { setAi((await internalApi.match(description, discipline || null, deadline || null)).matches) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const option = (f: Freelancer, extra?: React.ReactNode) => (
    <button key={f.id} type="button" onClick={() => onChange(f.id)} aria-pressed={value === f.id}
      className={`flex min-h-[52px] w-full items-start gap-3 rounded-xl border px-3 py-2 text-left ${value === f.id ? 'border-[#3A913F] bg-[#3A913F]/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
      <Avatar name={f.name} url={f.avatar_url} size={28} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="text-sm font-medium text-zinc-100">{f.name}</span><span className="text-xs text-zinc-400">{ratingText(f)}</span></span>
        <span className="block text-xs text-zinc-400"><AvailabilityDot value={f.availability} /></span>
        {extra}
      </span>
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={suggest} busy={busy}><Sparkles size={14} /> AI-suggestie</Button>
        <span className="text-xs text-zinc-500">Kijkt naar disciplines, beschikbaarheid, beoordelingen en notities.</span>
      </div>
      <ErrorLine>{error}</ErrorLine>
      {ai && (ai.length === 0
        ? <p className="text-sm text-zinc-400">Geen geschikte kandidaten gevonden voor deze discipline en deadline.</p>
        : <div className="space-y-2" aria-label="AI-suggesties">{ai.map(m => byId.get(m.id) && option(byId.get(m.id)!, <>
            <span className="mt-1 block text-xs text-zinc-300">{m.rank}. {m.reden}</span>
            {m.aandachtspunt && <span className="mt-0.5 block text-xs text-amber-300">Let op: {m.aandachtspunt}</span>}
          </>))}</div>)}
      <div className="space-y-2" aria-label="Suggesties">
        {suggested.length ? suggested.map(f => option(f)) : <p className="text-sm text-zinc-500">Niemand beschikbaar met deze discipline. Kies hieronder iemand anders.</p>}
      </div>
      <Select value={value} onChange={e => onChange(e.target.value)} aria-label="Of kies iemand anders">
        <option value="">Of kies iemand anders…</option>
        {active.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>
    </div>
  )
}
