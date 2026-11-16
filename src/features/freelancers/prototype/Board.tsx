'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Eye, MessageSquare } from 'lucide-react'
import { CLIENTS, type AStatus, type PAssignment } from './data'
import { Initials, MultiSelect, Toggle, first, fmt } from './bits'
import { useProto } from './store'

// Opdrachtenbord: vijf kolommen in de volgorde van het werk. "Afgerond"
// (30 dagen) staat dichtgeklapt; geweigerd en geannuleerd zitten achter
// "Gesloten". Op de gsm: tabbladen met aantallen.

type Col = 'concept' | 'wacht' | 'bezig' | 'nakijken' | 'afgerond' | 'gesloten'
export const COLUMNS: { key: Col; title: string; statuses: AStatus[]; empty: string }[] = [
  { key: 'concept', title: 'Concept', statuses: ['concept'], empty: 'Geen concepten.' },
  { key: 'wacht', title: 'Wacht op freelancer', statuses: ['gedeeld'], empty: 'Niets gedeeld dat nog niet geaccepteerd is.' },
  { key: 'bezig', title: 'Bezig', statuses: ['geaccepteerd'], empty: 'Niemand is iets aan het maken.' },
  { key: 'nakijken', title: 'Na te kijken', statuses: ['opgeleverd'], empty: 'Niets na te kijken.' },
  { key: 'afgerond', title: 'Afgerond', statuses: ['afgerond'], empty: 'Niets afgerond de laatste 30 dagen.' },
  { key: 'gesloten', title: 'Gesloten', statuses: ['geweigerd', 'geannuleerd'], empty: 'Niets geweigerd of geannuleerd.' },
]
const MONTH = 30 * 86400_000

export default function Board() {
  const { assignments, freelancers, open } = useProto()
  const [who, setWho] = useState<string[]>([])
  const [clients, setClients] = useState<string[]>([])
  const [closed, setClosed] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [tab, setTab] = useState<Col | null>(null)
  const [now] = useState(() => Date.now())

  const byCol = useMemo(() => {
    const list = assignments.filter(a => (who.length === 0 || who.includes(a.freelancerId)) && (clients.length === 0 || clients.includes(a.client)))
    const m = Object.fromEntries(COLUMNS.map(c => [c.key, [] as PAssignment[]])) as Record<Col, PAssignment[]>
    for (const a of list) {
      const c = COLUMNS.find(c => c.statuses.includes(a.status))!
      if ((c.key === 'afgerond' || c.key === 'gesloten') && now - Date.parse(a.changedAt) > MONTH) continue
      m[c.key].push(a)
    }
    for (const k of Object.keys(m) as Col[]) m[k].sort((a, b) =>
      k === 'afgerond' || k === 'gesloten' ? b.changedAt.localeCompare(a.changedAt) : (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    return m
  }, [assignments, who, clients, now])

  const cols = COLUMNS.filter(c => c.key !== 'gesloten' || closed)
  const mobileTab = tab && cols.some(c => c.key === tab) ? tab : (byCol.nakijken.length ? 'nakijken' : 'bezig')
  const used = new Set(assignments.map(a => a.freelancerId))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Freelancer" value={who} onChange={setWho}
          options={freelancers.filter(f => used.has(f.id)).map(f => ({ key: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label, 'nl'))} />
        <MultiSelect label="Klant" value={clients} onChange={setClients} options={CLIENTS.map(c => ({ key: c, label: c }))} />
        <Toggle on={closed} onChange={setClosed}>Gesloten</Toggle>
        {(who.length > 0 || clients.length > 0) && <button type="button" onClick={() => { setWho([]); setClients([]) }} className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-200">Wissen</button>}
      </div>

      {/* Gsm: tabbladen met aantallen */}
      <div className="md:hidden">
        <div role="tablist" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {cols.map(c => (
            <button key={c.key} role="tab" type="button" aria-selected={mobileTab === c.key} onClick={() => setTab(c.key)}
              className={`inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${mobileTab === c.key ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 text-zinc-300'}`}>
              {c.title}<span className={`text-xs ${c.key === 'nakijken' && byCol[c.key].length ? 'font-semibold text-amber-300' : 'text-zinc-500'}`}>{byCol[c.key].length}</span>
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-2">
          {byCol[mobileTab].length === 0
            ? <li className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">{COLUMNS.find(c => c.key === mobileTab)!.empty}</li>
            : byCol[mobileTab].map(a => <li key={a.id}><Card a={a} onOpen={() => open(a.id)} /></li>)}
        </ul>
      </div>

      {/* Desktop: kolommen */}
      <div className="hidden gap-3 md:grid" style={{ gridTemplateColumns: cols.map(c => (c.key === 'afgerond' && !doneOpen ? '3.25rem' : 'minmax(0,1fr)')).join(' ') }}>
        {cols.map(c => c.key === 'afgerond' && !doneOpen ? (
          <button key={c.key} type="button" onClick={() => setDoneOpen(true)} title="Afgerond, laatste 30 dagen — openklappen"
            className="flex min-h-[16rem] flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 py-3 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200">
            <ChevronRight size={16} aria-hidden />
            <span className="text-xs text-zinc-500">{byCol.afgerond.length}</span>
            <span className="text-sm font-medium [writing-mode:vertical-rl]">Afgerond</span>
          </button>
        ) : (
          <section key={c.key} aria-label={c.title} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-2">
            <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
              <h3 className="text-sm font-medium text-zinc-200">{c.title} <span className={c.key === 'nakijken' && byCol[c.key].length ? 'text-amber-300' : 'text-zinc-500'}>{byCol[c.key].length}</span></h3>
              {c.key === 'afgerond' && <button type="button" onClick={() => setDoneOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Dichtklappen</button>}
            </header>
            {c.key === 'afgerond' && <p className="px-1.5 pb-2 text-xs text-zinc-500">Laatste 30 dagen</p>}
            <ul className="space-y-2">
              {byCol[c.key].length === 0
                ? <li className="px-1.5 py-6 text-center text-xs text-zinc-600">{c.empty}</li>
                : byCol[c.key].map(a => <li key={a.id}><Card a={a} onOpen={() => open(a.id)} /></li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/** Eén kaart: titel, wie, klant, en hooguit één signaal. */
function Card({ a, onOpen }: { a: PAssignment; onOpen: () => void }) {
  const { freelancers } = useProto()
  const f = freelancers.find(x => x.id === a.freelancerId)!
  const dl = a.deadline && ['concept', 'gedeeld', 'geaccepteerd', 'opgeleverd'].includes(a.status) ? fmt.deadline(a.deadline) : null
  const feedback = a.status === 'geaccepteerd' && a.events[0]?.message && a.events[0].who === 'team'
  const signal = a.pending ? { icon: <AlertTriangle size={12} />, text: 'Bijlage niet geüpload', cls: 'text-red-300' }
    : a.status === 'geweigerd' ? { icon: null, text: 'Geweigerd — kies iemand anders', cls: 'text-red-300' }
    : a.status === 'geannuleerd' ? { icon: null, text: 'Geannuleerd', cls: 'text-zinc-500' }
    : feedback ? { icon: <MessageSquare size={12} />, text: 'Feedback gestuurd', cls: 'text-sky-300' }
    : a.status === 'gedeeld' && a.seen ? { icon: <Eye size={12} />, text: 'Bekeken', cls: 'text-zinc-400' }
    : a.status === 'afgerond' && a.review ? { icon: null, text: `★ ${a.review.score}`, cls: 'text-amber-300' }
    : null
  return (
    <button type="button" onClick={onOpen}
      className="w-full space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A913F]/50 active:bg-zinc-800">
      <p className="line-clamp-2 text-sm font-medium text-zinc-100">{a.title}</p>
      <p className="flex items-center gap-2 text-xs text-zinc-400"><Initials name={f.name} size={20} /><span className="truncate">{first(f.name)} · {a.client}</span></p>
      {(dl || signal) && (
        <p className="flex items-center justify-between gap-2 text-xs">
          {signal ? <span className={`inline-flex items-center gap-1 ${signal.cls}`}>{signal.icon}{signal.text}</span> : <span />}
          {dl && <span className={dl.late && a.status !== 'opgeleverd' ? 'text-red-400' : 'text-zinc-500'}>{dl.text}</span>}
        </p>
      )}
    </button>
  )
}
