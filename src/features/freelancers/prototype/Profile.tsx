'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, ExternalLink, Mail, Phone, Plus } from 'lucide-react'
import { Button, Field, Select, buttonCls, inputCls, textareaCls } from '@/components/materiaal/ui'
import { Modal } from '@/components/poolwagens/ui'
import { Chip } from '../internal/ui'
import { DISCIPLINES, FSTATUS_LABEL, LABEL, reviewsOf, type FStatus, type PFreelancer } from './data'
import { AV_LABEL, Avail, Initials, Rating, StarsInput, first, fmt } from './bits'
import { useProto } from './store'

// Profiel op één pagina, zonder tabbladen. Links wie het is (één knop
// "Bewerken" voor alles), rechts de opdrachten. Hoofdknop: Nieuwe opdracht.

const ACTIVE = ['concept', 'gedeeld', 'geaccepteerd', 'opgeleverd']
const STATUS_TEXT: Record<string, string> = { concept: 'Concept', gedeeld: 'Wacht op antwoord', geaccepteerd: 'Bezig', opgeleverd: 'Na te kijken', afgerond: 'Afgerond', geweigerd: 'Geweigerd', geannuleerd: 'Geannuleerd' }

export default function Profile({ id }: { id: string }) {
  const { freelancers, assignments, go, open, say } = useProto()
  const [editing, setEditing] = useState(false)
  const [newPin, setNewPin] = useState<string | null>(null)
  const f = freelancers.find(x => x.id === id)
  if (!f) return <p className="text-sm text-zinc-400">Niet gevonden. <button type="button" onClick={() => go('lijst')} className="text-[#5fbf64]">Terug</button></p>
  const mine = assignments.filter(a => a.freelancerId === f.id).sort((a, b) => b.changedAt.localeCompare(a.changedAt))
  const active = mine.filter(a => ACTIVE.includes(a.status)), past = mine.filter(a => !ACTIVE.includes(a.status))
  const rv = reviewsOf(f, assignments)

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <button type="button" onClick={() => go('lijst')} className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={16} /> Freelancers</button>

      <header className="flex flex-wrap items-start gap-4">
        <Initials name={f.name} size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="break-words text-xl font-semibold text-white">{f.name}</h1>
          <p className="text-sm text-zinc-400">{f.disciplines.map(d => LABEL[d]).join(' · ') || 'Nog geen discipline'} — {FSTATUS_LABEL[f.status]}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1"><Rating f={f} all={assignments} inline /><Avail f={f} /></div>
        </div>
        <div className="hidden gap-2 md:flex">
          <Button onClick={() => setEditing(true)}>Bewerken</Button>
          {f.status !== 'inactief' && <Button variant="primary" onClick={() => go('nieuw', { f: f.id })}><Plus size={14} /> Nieuwe opdracht</Button>}
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[minmax(260px,340px)_1fr]">
        <aside className="space-y-3">
          <Card title="Contact">
            <div className="flex flex-wrap gap-2">
              {f.phone && <a href={`tel:${f.phone.replace(/\s+/g, '')}`} className={`${buttonCls('secondary')} !h-11 sm:!h-9`}><Phone size={14} /> {f.phone}</a>}
              {f.email && <a href={`mailto:${f.email}`} className={`${buttonCls('secondary')} !h-11 max-w-full sm:!h-9`}><Mail size={14} /><span className="truncate">{f.email}</span></a>}
            </div>
          </Card>
          <Card title="Afspraken">
            <dl className="space-y-2 text-sm">
              <Row k="Tarief">{f.rate || '—'}</Row>
              <Row k="Teamoordeel">{f.teamRating ? `${'★'.repeat(f.teamRating)} ${f.teamNote ? `— ${f.teamNote}` : ''}` : '—'}</Row>
              <Row k="Opdrachten">{rv.count ? `${fmt.score(rv.avg!)} gemiddeld over ${rv.count}` : 'nog geen'}</Row>
              <Row k="Beschikbaar">{AV_LABEL[f.availability].label}{f.availableFrom && f.availability !== 'beschikbaar' ? `, vanaf ${fmt.date(f.availableFrom)}` : ''} <span className="text-xs text-zinc-500">({f.availabilityBy === 'freelancer' ? 'door freelancer' : 'door team'})</span></Row>
            </dl>
          </Card>
          {(f.notes || f.portfolio.length > 0) && (
            <Card title="Notities en portfolio">
              {f.notes && <p className="whitespace-pre-wrap text-sm text-zinc-300">{f.notes}</p>}
              {f.portfolio.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-h-[32px] items-center gap-1.5 text-sm text-[#5fbf64] hover:underline"><ExternalLink size={13} />{l.label}</a>)}
            </Card>
          )}
          <Card title="Persoonlijke link">
            {f.link.active ? (<>
              <p className="text-sm text-zinc-300">Actief · {f.link.lastOpened ? `laatst geopend ${fmt.ago(f.link.lastOpened)}` : 'nog nooit geopend'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => say('Link gekopieerd.')}><Copy size={13} /> Link kopiëren</Button>
                <Button size="sm" onClick={() => setNewPin(String(1000 + Math.floor(Math.random() * 9000)))}>Nieuwe pincode</Button>
              </div>
            </>) : <p className="text-sm text-zinc-400">Nog geen link. Die maken we vanzelf bij de eerste gedeelde opdracht.</p>}
          </Card>
        </aside>

        <section aria-label="Opdrachten" className="space-y-4">
          <List title={`Lopend (${active.length})`} items={active} empty={`${first(f.name)} heeft nu niets lopen.`} onOpen={open} />
          <List title={`Eerder (${past.length})`} items={past} empty="Nog geen eerdere opdrachten." onOpen={open} />
        </section>
      </div>

      {/* Gsm: hoofdknop onderaan */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <Button className="!h-12 flex-1" onClick={() => setEditing(true)}>Bewerken</Button>
        {f.status !== 'inactief' && <Button variant="primary" className="!h-12 flex-[2]" onClick={() => go('nieuw', { f: f.id })}>Nieuwe opdracht</Button>}
      </div>

      {editing && <Edit f={f} onClose={() => setEditing(false)} />}
      {newPin && (
        <Modal title="Nieuwe pincode" onClose={() => setNewPin(null)} footer={<Button variant="primary" onClick={() => setNewPin(null)}>Klaar</Button>}>
          <p className="text-sm text-zinc-400">De oude pincode werkt niet meer. Deze wordt maar één keer getoond; stuur ze apart van de link.</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-white">{newPin}</p>
        </Modal>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"><h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>{children}</section>
}
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-200">{children}</dd></div>
}

function List({ title, items, empty, onOpen }: { title: string; items: ReturnType<typeof useProto>['assignments']; empty: string; onOpen: (id: string) => void }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
          {items.map(a => (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900/60">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-100">{a.title}</span><span className="block text-xs text-zinc-500">{a.client} · {fmt.date(a.changedAt)}</span></span>
                <span className={`flex-shrink-0 text-xs ${a.status === 'opgeleverd' ? 'text-amber-300' : a.status === 'geweigerd' ? 'text-red-300' : 'text-zinc-400'}`}>
                  {a.review ? <span className="text-amber-300">{'★'.repeat(a.review.score)}</span> : STATUS_TEXT[a.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Alles in één formulier in plaats van zes kaarten met elk een potlood. */
function Edit({ f, onClose }: { f: PFreelancer; onClose: () => void }) {
  const { updateFreelancer } = useProto()
  const [v, setV] = useState({ ...f, portfolioText: f.portfolio.map(l => `${l.label} | ${l.url}`).join('\n') })
  const [err, setErr] = useState('')
  function save() {
    if (!v.name.trim()) return setErr('Geef een naam.')
    const { portfolioText, ...rest } = v
    updateFreelancer(f.id, { ...rest, availabilityBy: rest.availability !== f.availability || rest.availableFrom !== f.availableFrom ? 'team' : f.availabilityBy,
      portfolio: portfolioText.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [label, url] = l.includes('|') ? l.split('|').map(x => x.trim()) : ['Portfolio', l]; return { label, url } }) })
    onClose()
  }
  return (
    <Modal wide title={`${f.name} bewerken`} onClose={onClose} footer={<><Button onClick={onClose}>Annuleren</Button><Button variant="primary" onClick={save}>Opslaan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Naam"><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
        <Field label="Status"><Select className="!text-base sm:!text-sm" value={v.status} onChange={e => setV({ ...v, status: e.target.value as FStatus })}>
          {(Object.keys(FSTATUS_LABEL) as FStatus[]).map(s => <option key={s} value={s}>{FSTATUS_LABEL[s]}</option>)}</Select></Field>
        <Field label="Telefoon"><input type="tel" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
        <Field label="E-mail"><input type="email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
      </div>
      <div><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Disciplines</span>
        <div className="flex flex-wrap gap-1.5">{DISCIPLINES.map(d => <Chip key={d.key} active={v.disciplines.includes(d.key)} onClick={() => setV({ ...v, disciplines: v.disciplines.includes(d.key) ? v.disciplines.filter(x => x !== d.key) : [...v.disciplines, d.key] })}>{d.label}</Chip>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tarief"><input value={v.rate} onChange={e => setV({ ...v, rate: e.target.value })} className={`${inputCls} !text-base sm:!text-sm`} placeholder="bv. €350 / dag" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Beschikbaar"><Select className="!text-base sm:!text-sm" value={v.availability} onChange={e => setV({ ...v, availability: e.target.value as PFreelancer['availability'] })}>
            <option value="beschikbaar">Ja</option><option value="beperkt">Beperkt</option><option value="niet_beschikbaar">Nee</option></Select></Field>
          {v.availability !== 'beschikbaar' && <Field label="Weer vanaf"><input type="date" value={v.availableFrom ?? ''} onChange={e => setV({ ...v, availableFrom: e.target.value || null })} className={`${inputCls} !text-base sm:!text-sm`} /></Field>}
        </div>
      </div>
      <div><span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Teamoordeel</span><StarsInput value={v.teamRating ?? 0} onChange={n => setV({ ...v, teamRating: n })} /></div>
      <Field label="Notities (intern)"><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} className={`${textareaCls} min-h-[6rem] !text-base sm:!text-sm`} /></Field>
      <Field label="Portfolio — één link per regel: label | https://…"><textarea value={v.portfolioText} onChange={e => setV({ ...v, portfolioText: e.target.value })} className={`${textareaCls} !text-base sm:!text-sm`} /></Field>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </Modal>
  )
}
