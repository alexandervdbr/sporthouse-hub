'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Download, FileText, MoreHorizontal, Paperclip, X } from 'lucide-react'
import { Button, Field, inputCls, textareaCls } from '@/components/materiaal/ui'
import { Modal } from '@/components/poolwagens/ui'
import { shareMessage } from '../internal/api'
import { LABEL, recommend, type PAssignment } from './data'
import { Initials, ProtoOnly, StarsInput, first, fmt } from './bits'
import { useProto } from './store'

// Eén opdracht. Desktop: paneel rechts; gsm: volledig scherm. Bovenaan één
// zin over waar het staat en hooguit één hoofdknop. De rest zit achter "…".

type Dialog = null | 'goedkeuren' | 'terugsturen' | 'annuleren' | 'bericht' | 'toewijzen' | 'bewerken' | 'verwijderen'

const STATE: Record<PAssignment['status'], (name: string) => string> = {
  concept: () => 'Concept — nog niet gedeeld',
  gedeeld: n => `Wacht tot ${n} accepteert`,
  geaccepteerd: n => `${n} is ermee bezig`,
  opgeleverd: n => `${n} heeft opgeleverd — na te kijken`,
  afgerond: () => 'Afgerond',
  geweigerd: n => `${n} heeft geweigerd`,
  geannuleerd: () => 'Geannuleerd',
}

export default function Detail({ id }: { id: string }) {
  const { assignments, freelancers, open, go, share, move, updateAssignment, say } = useProto()
  const a = assignments.find(x => x.id === id)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState(false)
  const [history, setHistory] = useState(false)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog) open(null) }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [dialog, open])
  if (!a) return null
  const f = freelancers.find(x => x.id === a.freelancerId)!
  const name = first(f.name)
  const dl = a.deadline ? fmt.deadline(a.deadline) : null
  const copyMsg = () => { navigator.clipboard?.writeText(shareMessage(f.name, 'https://hub.sporthousegroup.com/f#…')).catch(() => {}); say('Bericht gekopieerd — plak het in WhatsApp of sms.') }

  const primary: { label: string; run: () => void } | null =
    a.pending ? null
    : a.status === 'concept' ? { label: `Delen met ${name}`, run: () => share(a.id) }
    : a.status === 'gedeeld' ? { label: `Bericht voor ${name} kopiëren`, run: copyMsg }
    : a.status === 'opgeleverd' ? { label: 'Goedkeuren', run: () => setDialog('goedkeuren') }
    : a.status === 'geweigerd' ? { label: 'Iemand anders kiezen', run: () => setDialog('toewijzen') }
    : null
  const secondary: { label: string; run: () => void; danger?: boolean }[] = [
    ...(a.status === 'opgeleverd' ? [{ label: 'Terugsturen met feedback', run: () => setDialog('terugsturen') }] : []),
    ...(a.status === 'geaccepteerd' ? [{ label: `Bericht aan ${name}`, run: () => setDialog('bericht') }] : []),
  ]
  const more: { label: string; run: () => void; danger?: boolean }[] = [
    ...(['concept', 'gedeeld', 'geaccepteerd'].includes(a.status) ? [{ label: 'Bewerken', run: () => setDialog('bewerken') }] : []),
    ...(a.status === 'afgerond' ? [{ label: 'Heropenen', run: () => move(a.id, 'opgeleverd', { who: 'team', text: 'Heropend' }) }] : []),
    { label: `Profiel van ${name}`, run: () => go('profiel', { id: f.id }) },
    ...(a.status === 'concept' ? [{ label: 'Verwijderen', run: () => setDialog('verwijderen'), danger: true }] : []),
    ...(['gedeeld', 'geaccepteerd', 'opgeleverd'].includes(a.status) ? [{ label: 'Annuleren', run: () => setDialog('annuleren'), danger: true }] : []),
  ]
  const ours = a.files.filter(x => x.by === 'team'), theirs = a.files.filter(x => x.by === 'freelancer')
  const lastFeedback = a.status === 'geaccepteerd' ? a.events.find(e => e.who === 'team' && e.message) : null
  const refusal = a.status === 'geweigerd' ? a.events.find(e => e.who === 'freelancer' && e.text === 'Geweigerd') : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 hidden bg-black/50 md:block" onClick={() => open(null)} />
      <aside role="dialog" aria-modal="true" aria-label={a.title} className="relative flex h-[100dvh] w-full flex-col bg-zinc-950 md:w-[34rem] md:border-l md:border-zinc-800">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-800 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" onClick={() => open(null)} aria-label="Sluiten" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><X size={20} /></button>
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{a.client}</span>
          <div className="relative">
            <button type="button" onClick={() => setMenu(m => !m)} aria-label="Meer" aria-expanded={menu} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><MoreHorizontal size={20} /></button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl" onClick={() => setMenu(false)}>
                {more.map(m => <button key={m.label} type="button" onClick={m.run} className={`flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-zinc-800 ${m.danger ? 'text-red-400' : 'text-zinc-200'}`}>{m.label}</button>)}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <header className="space-y-1.5">
            <h2 className="break-words text-xl font-semibold text-white">{a.title}</h2>
            <p className="text-sm text-zinc-300">{STATE[a.status](name)}</p>
          </header>

          {a.pending && <Pending a={a} />}

          {lastFeedback && <Quote who="Jouw feedback" at={lastFeedback.at}>{lastFeedback.message}</Quote>}
          {refusal?.message && <Quote who={`${name} schreef`} at={refusal.at}>{refusal.message}</Quote>}
          {a.review && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <span className="text-amber-300">{'★'.repeat(a.review.score)}<span className="text-zinc-700">{'★'.repeat(5 - a.review.score)}</span></span>
              {a.review.comment && <p className="mt-1 text-zinc-300">{a.review.comment}</p>}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2 flex items-center gap-2.5">
              <Initials name={f.name} size={32} />
              <div className="min-w-0"><button type="button" onClick={() => go('profiel', { id: f.id })} className="font-medium text-zinc-100 hover:underline">{f.name}</button>
                <div className="text-xs text-zinc-500">{f.phone}</div></div>
            </div>
            <div><dt className="text-xs text-zinc-500">Deadline</dt><dd className={dl?.late && ['gedeeld', 'geaccepteerd'].includes(a.status) ? 'text-red-400' : 'text-zinc-200'}>{a.deadline ? `${fmt.long(a.deadline)}${dl && ['concept', 'gedeeld', 'geaccepteerd'].includes(a.status) ? ` · ${dl.text}` : ''}` : '—'}</dd></div>
            <div><dt className="text-xs text-zinc-500">Discipline</dt><dd className="text-zinc-200">{LABEL[a.discipline] ?? '—'}</dd></div>
          </dl>

          <section aria-label="Briefing">
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">Briefing</h3>
            {a.briefing ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">{a.briefing}</p> : <p className="text-sm text-zinc-500">Geen briefing.</p>}
          </section>

          {(theirs.length > 0 || ['geaccepteerd', 'opgeleverd', 'afgerond'].includes(a.status)) && (
            <Files title={`Opgeleverd door ${name}`} files={theirs} empty="Nog niets opgeleverd." />
          )}
          <Files title="Bijlagen van ons" files={ours} empty="Geen bijlagen." add={!['afgerond', 'geannuleerd'].includes(a.status)} onAdd={() => updateAssignment(a.id, { files: [...a.files, { name: 'Extra_info.pdf', size: '88 kB', by: 'team', at: new Date().toISOString() }] })} />

          <section>
            <button type="button" onClick={() => setHistory(h => !h)} aria-expanded={history} className="inline-flex min-h-[40px] items-center gap-1 text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
              Geschiedenis ({a.events.length})<ChevronDown size={14} className={history ? 'rotate-180' : ''} />
            </button>
            {history && (
              <ol className="mt-1 space-y-2 border-l border-zinc-800 pl-3 text-sm">
                {a.events.map((e, i) => (
                  <li key={i}><span className="text-zinc-300">{e.who === 'team' ? 'Team' : name}: {e.text.toLowerCase()}</span> <span className="text-xs text-zinc-500">· {fmt.ago(e.at)}</span>
                    {e.message && <p className="text-zinc-400">“{e.message}”</p>}</li>
                ))}
              </ol>
            )}
          </section>

          <Simulate a={a} />
        </div>

        {(primary || secondary.length > 0) && (
          <div className="flex flex-shrink-0 gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {secondary.map(s => <Button key={s.label} className="!h-12 flex-1 md:!h-10" onClick={s.run}>{s.label}</Button>)}
            {primary && <Button variant="primary" className="!h-12 flex-1 md:!h-10" onClick={primary.run}>{primary.label}</Button>}
          </div>
        )}
      </aside>
      {dialog && <Dialogs kind={dialog} a={a} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Quote({ who, at, children }: { who: string; at: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
      <p className="text-xs text-sky-300">{who} · {fmt.ago(at)}</p>
      <p className="mt-1 whitespace-pre-wrap text-zinc-200">{children}</p>
    </div>
  )
}

function Files({ title, files, empty, add, onAdd }: { title: string; files: PAssignment['files']; empty: string; add?: boolean; onAdd?: () => void }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {files.length === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {files.map(x => (
            <li key={x.name} className="flex items-center gap-3 px-3 py-2">
              <FileText size={16} className="flex-shrink-0 text-zinc-500" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-200">{x.name}</span><span className="text-xs text-zinc-500">{x.size} · {fmt.ago(x.at)}</span></span>
              <button type="button" aria-label={`${x.name} downloaden`} className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Download size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {add && <button type="button" onClick={onAdd} className="mt-1.5 inline-flex min-h-[40px] items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><Paperclip size={14} /> Bijlage toevoegen</button>}
    </section>
  )
}

/** Bug 7: na een gedeeltelijke fout ga je hier verder. Niets is stil verloren. */
function Pending({ a }: { a: PAssignment }) {
  const { updateAssignment, share, freelancers } = useProto()
  const p = a.pending!
  const name = first(freelancers.find(f => f.id === a.freelancerId)!.name)
  const retry = () => {
    const files = [...a.files, ...p.failedFiles.map(n => ({ name: n, size: '1,4 MB', by: 'team' as const, at: new Date().toISOString() }))]
    updateAssignment(a.id, { files, pending: null })
    if (p.share) share(a.id)
  }
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
      <p className="flex items-start gap-2 text-red-200"><AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
        <span>De opdracht is bewaard, maar {p.failedFiles.length === 1 ? 'deze bijlage is' : 'deze bijlagen zijn'} niet geüpload: <b className="font-medium">{p.failedFiles.join(', ')}</b>.
          {p.share ? ` Daarom is ze nog niet gedeeld met ${name}.` : ''}</span></p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={retry}>{p.share ? 'Opnieuw uploaden en delen' : 'Opnieuw uploaden'}</Button>
        <Button onClick={() => { updateAssignment(a.id, { pending: null }); if (p.share) share(a.id) }}>{p.share ? 'Delen zonder bijlage' : 'Zonder bijlage verder'}</Button>
      </div>
    </div>
  )
}

/** Wat de freelancer op zijn link doet, om de flow te kunnen doorlopen. */
function Simulate({ a }: { a: PAssignment }) {
  const { move, updateAssignment, freelancers } = useProto()
  const name = first(freelancers.find(f => f.id === a.freelancerId)!.name)
  if (!['gedeeld', 'geaccepteerd'].includes(a.status)) return null
  return (
    <ProtoOnly label={`Doen alsof ${name} op de link iets doet`}>
      {a.status === 'gedeeld' && !a.seen && <Button size="sm" onClick={() => updateAssignment(a.id, { seen: true, events: [{ at: new Date().toISOString(), who: 'freelancer', text: 'Bekeken' }, ...a.events] })}>Bekijkt</Button>}
      {a.status === 'gedeeld' && <Button size="sm" onClick={() => move(a.id, 'geaccepteerd', { who: 'freelancer', text: 'Geaccepteerd' }, { seen: true })}>Accepteert</Button>}
      {a.status === 'gedeeld' && <Button size="sm" onClick={() => move(a.id, 'geweigerd', { who: 'freelancer', text: 'Geweigerd', message: 'Sorry, ik zit die week vol.' })}>Weigert</Button>}
      {a.status === 'geaccepteerd' && <Button size="sm" onClick={() => move(a.id, 'opgeleverd', { who: 'freelancer', text: 'Opgeleverd' }, {
        files: [...a.files, { name: `${a.title.split(' ')[0]}_v${a.files.filter(x => x.by === 'freelancer').length + 1}.mp4`, size: '380 MB', by: 'freelancer', at: new Date().toISOString() }] })}>Levert op</Button>}
    </ProtoOnly>
  )
}

function Dialogs({ kind, a, onClose }: { kind: NonNullable<Dialog>; a: PAssignment; onClose: () => void }) {
  const { move, freelancers, assignments, updateAssignment, open, share, remove, create, say } = useProto()
  const f = freelancers.find(x => x.id === a.freelancerId)!
  const name = first(f.name)
  const [score, setScore] = useState(0)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState({ title: a.title, briefing: a.briefing, deadline: a.deadline ?? '' })
  const [pick, setPick] = useState('')
  const footer = (label: string, run: () => void, danger = false) => <><Button onClick={onClose}>Terug</Button><Button variant={danger ? 'destructive' : 'primary'} onClick={run}>{label}</Button></>

  if (kind === 'goedkeuren') return (
    <Modal title="Goedkeuren" onClose={onClose} footer={footer('Goedkeuren', () => {
      if (!score) return setErr('Geef een score — die telt mee in de beoordeling van ' + name + '.')
      move(a.id, 'afgerond', { who: 'team', text: 'Goedgekeurd' }, { review: { score, comment: text } }); onClose(); say(`Goedgekeurd. ${name} ziet “Goedgekeurd” op de link.`)
    })}>
      <p className="text-sm text-zinc-400">De opdracht wordt afgerond. {name} ziet “Goedgekeurd”; de score en je opmerking blijven intern.</p>
      <div><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Hoe ging het?</span><StarsInput value={score} onChange={n => { setScore(n); setErr('') }} /></div>
      <Field label="Opmerking (intern, optioneel)"><textarea value={text} onChange={e => setText(e.target.value)} className={`${textareaCls} !text-base sm:!text-sm`} placeholder="bv. Snel geleverd, kleurcorrectie top" /></Field>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </Modal>
  )
  if (kind === 'terugsturen' || kind === 'bericht') return (
    <Modal title={kind === 'terugsturen' ? 'Terugsturen met feedback' : `Bericht aan ${name}`} onClose={onClose} footer={footer(kind === 'terugsturen' ? 'Terugsturen' : 'Versturen', () => {
      if (!text.trim()) return setErr('Schrijf wat er anders moet.')
      if (kind === 'terugsturen') move(a.id, 'geaccepteerd', { who: 'team', text: 'Teruggestuurd met feedback', message: text.trim() })
      else updateAssignment(a.id, { events: [{ at: new Date().toISOString(), who: 'team', text: 'Bericht', message: text.trim() }, ...a.events] })
      onClose(); say(`${name} ziet je bericht op de link. Stuur zelf even een seintje — de app mailt niet.`)
    })}>
      <p className="text-sm text-zinc-400">{kind === 'terugsturen' ? `De opdracht gaat terug naar “Bezig”. ${name} ziet je bericht bovenaan de opdracht.` : `${name} ziet dit bericht bij de opdracht op de link.`}</p>
      <textarea autoFocus value={text} onChange={e => { setText(e.target.value); setErr('') }} className={`${textareaCls} min-h-[8rem] !text-base sm:!text-sm`} aria-label="Bericht" placeholder="Wat moet er anders?" />
      {err && <p className="text-sm text-red-400">{err}</p>}
    </Modal>
  )
  if (kind === 'annuleren' || kind === 'verwijderen') return (
    <Modal title={kind === 'annuleren' ? 'Opdracht annuleren?' : 'Concept verwijderen?'} onClose={onClose} footer={footer(kind === 'annuleren' ? 'Annuleren' : 'Verwijderen', () => {
      if (kind === 'annuleren') move(a.id, 'geannuleerd', { who: 'team', text: 'Geannuleerd', message: text.trim() || undefined })
      else { open(null); remove(a.id) }
      onClose()
    }, true)}>
      <p className="text-sm text-zinc-400">{kind === 'annuleren' ? `De opdracht verdwijnt van de link van ${name}. Laat het ${name} zelf even weten.` : 'Het concept was nog niet gedeeld; niemand anders heeft het gezien.'}</p>
      {kind === 'annuleren' && <Field label="Reden (intern, optioneel)"><input value={text} onChange={e => setText(e.target.value)} className={`${inputCls} !text-base sm:!text-sm`} /></Field>}
    </Modal>
  )
  if (kind === 'toewijzen') {
    const recs = recommend(freelancers.filter(x => x.id !== f.id), assignments, { discipline: a.discipline, deadline: a.deadline ?? '', client: a.client }).slice(0, 5)
    return (
      <Modal title="Iemand anders kiezen" onClose={onClose} footer={footer(pick ? `Delen met ${first(freelancers.find(x => x.id === pick)!.name)}` : 'Delen', () => {
        if (!pick) return setErr('Kies iemand.')
        // Een kopie voor de nieuwe freelancer; de geweigerde blijft bij de eerste.
        const id = create({ title: a.title, briefing: a.briefing, discipline: a.discipline, client: a.client, deadline: a.deadline ?? '', files: a.files.filter(x => x.by === 'team').map(x => x.name), freelancerId: pick }, true, false)
        onClose(); open(id); setTimeout(() => share(id, pick))
      })}>
        <p className="text-sm text-zinc-400">Titel, briefing en bijlagen gaan in een nieuwe opdracht naar iemand anders. Deze blijft als “geweigerd” bij {name} staan.</p>
        <ul className="space-y-1.5">{recs.map(r => (
          <li key={r.f.id}><button type="button" onClick={() => { setPick(r.f.id); setErr('') }} aria-pressed={pick === r.f.id}
            className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left ${pick === r.f.id ? 'border-[#3A913F] bg-[#3A913F]/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
            <Initials name={r.f.name} size={32} /><span className="min-w-0"><span className="block text-sm text-zinc-100">{r.f.name}</span><span className="block text-xs text-zinc-500">{r.why.join(' · ')}</span></span>
          </button></li>))}</ul>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </Modal>
    )
  }
  return (
    <Modal title="Opdracht bewerken" onClose={onClose} footer={footer('Opslaan', () => {
      if (!edit.title.trim()) return setErr('Geef een titel.')
      updateAssignment(a.id, { title: edit.title.trim(), briefing: edit.briefing, deadline: edit.deadline || null }); onClose()
      if (a.status !== 'concept') say(`Opgeslagen. ${name} ziet de nieuwe versie op de link.`)
    })}>
      <Field label="Titel"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
      <Field label="Briefing"><textarea value={edit.briefing} onChange={e => setEdit({ ...edit, briefing: e.target.value })} className={`${textareaCls} min-h-[10rem] !text-base sm:!text-sm`} /></Field>
      <Field label="Deadline"><input type="date" value={edit.deadline} onChange={e => setEdit({ ...edit, deadline: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </Modal>
  )
}
