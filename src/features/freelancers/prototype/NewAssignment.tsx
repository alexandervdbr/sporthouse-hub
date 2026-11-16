'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, FileText, Paperclip, Search, X } from 'lucide-react'
import { Button, inputCls, textareaCls } from '@/components/materiaal/ui'
import { Chip } from '../internal/ui'
import { CLIENTS, DISCIPLINES, recommend } from './data'
import { Avail, Initials, ProtoOnly, Rating, first } from './bits'
import { useProto } from './store'

// Nieuwe opdracht: begint bij wat er moet gebeuren, eindigt bij wie het
// doet (aanbevolen bovenaan). Eén hoofdknop: "Delen met <naam>".
// Na het bewaren kom je altijd in het opdrachtpaneel; lukt een bijlage niet,
// dan ga je daar verder (bug 7) — er wordt dan niet stil gedeeld.

const label = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500'

export default function NewAssignment() {
  const { freelancers, assignments, preset, create, share, go } = useProto()
  const [title, setTitle] = useState('')
  const [briefing, setBriefing] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [client, setClient] = useState('')
  const [deadline, setDeadline] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [who, setWho] = useState(preset ?? '')
  const [others, setOthers] = useState(false)
  const [q, setQ] = useState('')
  const [failFile, setFailFile] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const recs = useMemo(() => recommend(freelancers, assignments, { discipline, deadline, client }), [freelancers, assignments, discipline, deadline, client])
  const top = discipline ? recs.filter(r => r.match).slice(0, 3) : []
  const chosen = freelancers.find(f => f.id === who)
  const rest = recs.filter(r => !top.some(t => t.f.id === r.f.id) && r.f.name.toLowerCase().includes(q.toLowerCase()))

  function submit(doShare: boolean) {
    if (!title.trim()) return setErr('Wat moet er gebeuren? Geef de opdracht een titel.')
    if (!who) return setErr('Kies wie het doet.')
    const fail = failFile && files.length > 0
    const id = create({ title: title.trim(), briefing, discipline, client, deadline, files, freelancerId: who }, doShare, fail)
    go('opdrachten', { a: id })
    if (doShare && !fail) setTimeout(() => share(id, who))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28 md:pb-6">
      <button type="button" onClick={() => go('opdrachten')} className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={16} /> Opdrachten</button>
      <h1 className="text-xl font-semibold text-white">Nieuwe opdracht</h1>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">1. Wat moet er gebeuren?</h3>
        <input autoFocus value={title} onChange={e => { setTitle(e.target.value); setErr('') }} aria-label="Titel"
          className={`${inputCls} !h-12 !text-base`} placeholder="bv. Aftermovie thuismatch tegen Lommel" />
        <textarea value={briefing} onChange={e => setBriefing(e.target.value)} aria-label="Briefing"
          className={`${textareaCls} min-h-[10rem] !text-base sm:!text-sm`} placeholder="Wat verwacht je? Formaat, lengte, sfeer, wat moet er zeker in…" />
        <div role="radiogroup" aria-label="Discipline" className="flex flex-wrap gap-1.5">
          {DISCIPLINES.map(d => <Chip key={d.key} active={discipline === d.key} onClick={() => setDiscipline(discipline === d.key ? '' : d.key)}>{d.label}</Chip>)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">2. Voor wie en tegen wanneer?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Klant</span>
            <input list="proto-clients" value={client} onChange={e => setClient(e.target.value)} className={`${inputCls} !h-11 !text-base sm:!h-9 sm:!text-sm`} placeholder="Kies of typ" />
            <datalist id="proto-clients">{CLIENTS.map(c => <option key={c} value={c} />)}</datalist></label>
          <label><span className={label}>Deadline</span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={`${inputCls} !h-11 !text-base sm:!h-9 sm:!text-sm`} /></label>
        </div>
        <div>
          <span className={label}>Bijlagen</span>
          {files.length > 0 && (
            <ul className="mb-2 divide-y divide-zinc-800 rounded-xl border border-zinc-800">{files.map(n => (
              <li key={n} className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-200"><FileText size={14} className="text-zinc-500" /><span className="min-w-0 flex-1 truncate">{n}</span>
                <button type="button" aria-label={`${n} weghalen`} onClick={() => setFiles(files.filter(x => x !== n))} className="flex h-9 w-9 items-center justify-center text-zinc-500 hover:text-zinc-200"><X size={14} /></button></li>))}</ul>
          )}
          <button type="button" onClick={() => input.current?.click()} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><Paperclip size={14} /> Bestanden toevoegen</button>
          <input ref={input} type="file" multiple className="sr-only" onChange={e => { setFiles([...files, ...Array.from(e.target.files ?? []).map(x => x.name).filter(n => !files.includes(n))]); e.target.value = '' }} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Wie doet het?">
        <h3 className="text-sm font-medium text-zinc-200">3. Wie doet het?</h3>
        {top.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Aanbevolen</p>
            {top.map(r => <Pick key={r.f.id} id={r.f.id} why={r.why.join(' · ')} on={who === r.f.id} onPick={() => { setWho(r.f.id); setErr('') }} />)}
          </div>
        ) : <p className="text-sm text-zinc-500">Kies hierboven een discipline, dan stellen we iemand voor.</p>}
        {chosen && !top.some(t => t.f.id === who) && <Pick id={chosen.id} why="Gekozen" on onPick={() => {}} />}
        {!others ? (
          <button type="button" onClick={() => setOthers(true)} className="inline-flex min-h-[44px] items-center text-sm text-zinc-400 hover:text-zinc-200">Iemand anders kiezen…</button>
        ) : (
          <div className="space-y-2">
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
              <input value={q} onChange={e => setQ(e.target.value)} className={`${inputCls} !h-11 !pl-9 !text-base sm:!h-9 sm:!text-sm`} placeholder="Zoek een freelancer" aria-label="Zoek een freelancer" /></div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {rest.map(r => <Pick key={r.f.id} id={r.f.id} why={r.why.join(' · ')} on={who === r.f.id} onPick={() => { setWho(r.f.id); setErr(''); setOthers(false); setQ('') }} />)}
            </div>
          </div>
        )}
      </section>

      <ProtoOnly><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={failFile} onChange={e => setFailFile(e.target.checked)} className="h-4 w-4 accent-violet-500" />
        Laat de laatste bijlage mislukken (om bug 7 te zien)</label></ProtoOnly>

      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:static md:justify-end md:border-0 md:bg-transparent md:p-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <Button className="!h-12 flex-1 md:!h-10 md:flex-none" onClick={() => submit(false)}>Opslaan als concept</Button>
        <Button variant="primary" className="!h-12 flex-[2] md:!h-10 md:flex-none" onClick={() => submit(true)}>{chosen ? `Delen met ${first(chosen.name)}` : 'Delen'}</Button>
      </div>
    </div>
  )
}

function Pick({ id, why, on, onPick }: { id: string; why: string; on: boolean; onPick: () => void }) {
  const { freelancers, assignments } = useProto()
  const f = freelancers.find(x => x.id === id)!
  return (
    <button type="button" onClick={onPick} aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${on ? 'border-[#3A913F] bg-[#3A913F]/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600'}`}>
      <Initials name={f.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium text-zinc-100">{f.name}</span><Rating f={f} all={assignments} inline /></span>
        <span className="block truncate text-xs text-zinc-500">{why}</span>
        {f.availability !== 'beschikbaar' && <span className="block pt-0.5"><Avail f={f} /></span>}
      </span>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${on ? 'border-[#3A913F] bg-[#3A913F]' : 'border-zinc-600'}`}>{on && <Check size={14} className="text-white" />}</span>
    </button>
  )
}
