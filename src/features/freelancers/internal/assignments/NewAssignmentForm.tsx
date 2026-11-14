'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button, ErrorLine, Field, Select, inputCls, textareaCls } from '@/components/materiaal/ui'
import ClientPicker from '@/components/poolwagens/ClientPicker'
import type { ClientRef } from '@/lib/poolwagens/types'
import { internalApi } from '../api'
import type { Discipline, Freelancer } from '../types'
import PageScroll from '../PageScroll'
import LinkReveal from '../LinkReveal'
import FreelancerSuggestions from './FreelancerSuggestions'
import PendingFiles, { uploadPending, type Pending } from './PendingFiles'

// Nieuwe opdracht: één formulier, geen wizard. Titel + discipline → briefing
// → klant · deadline → bijlagen → freelancer. "Opslaan als concept" of
// "Delen". Delen gebeurt pas na de bijlagen, zodat de freelancer ze meteen
// heeft; heeft hij nog geen link, dan verschijnen link en pincode één keer.
export default function NewAssignmentForm({ initialFreelancer }: { initialFreelancer: string | null }) {
  const router = useRouter()
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [clients, setClients] = useState<ClientRef[]>([])
  const [title, setTitle] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [briefing, setBriefing] = useState('')
  const [client, setClient] = useState('')
  const [deadline, setDeadline] = useState('')
  const [freelancerId, setFreelancerId] = useState(initialFreelancer ?? '')
  const [files, setFiles] = useState<Pending[]>([])
  const [busy, setBusy] = useState<false | 'concept' | 'delen'>(false)
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState<{ url: string; pin: string; then: string } | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([internalApi.list(), internalApi.disciplines(), fetch('/api/clients').then(r => (r.ok ? r.json() : []))])
      .then(([f, d, c]) => { if (alive) { setFreelancers(f); setDisciplines(d); setClients((c as ClientRef[]).map(x => ({ id: x.id, name: x.name }))) } })
      .catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [])

  const matched = useMemo(() => clients.find(c => c.name.trim().toLowerCase() === client.trim().toLowerCase()) ?? null, [clients, client])
  const chosen = freelancers.find(f => f.id === freelancerId)

  async function submit(share: boolean) {
    if (!title.trim()) { setError('Geef de opdracht een titel.'); return }
    if (!freelancerId) { setError('Kies een freelancer.'); return }
    setBusy(share ? 'delen' : 'concept'); setError('')
    try {
      const { assignment } = await internalApi.createAssignment({
        freelancer_id: freelancerId, title, discipline: discipline || null, briefing: briefing || null,
        client_id: matched?.id ?? null, client_name: matched ? null : client.trim() || null, deadline: deadline || null,
      })
      const warnings = await uploadPending(assignment.id, files, (key, pct) => setFiles(fs => fs.map(f => (f.key === key ? { ...f, progress: pct } : f))))
      const then = `/freelancers?tab=opdrachten&opdracht=${assignment.id}`
      if (share) {
        const r = await internalApi.transition(assignment.id, 'gedeeld')
        if (r.link) { setReveal({ ...r.link, then }); return }
      }
      if (warnings.length) setError(warnings.join(' '))
      router.push(then)
    } catch (err) {
      setError((err as Error).message); setBusy(false)
    }
  }

  return (
    <PageScroll>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 pb-32 sm:px-6 md:pb-10">
        <Link href="/freelancers?tab=opdrachten" className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={16} /> Opdrachten</Link>
        <h1 className="text-lg font-semibold text-zinc-100">Nieuwe opdracht</h1>

        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Field label="Titel *"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={`${inputCls} !h-11 !text-base sm:!h-9 sm:!text-sm`} placeholder="bv. Social content KRC Genk — december" /></Field>
          <Field label="Discipline"><Select value={discipline} onChange={e => setDiscipline(e.target.value)}>
            <option value="">—</option>{disciplines.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</Select></Field>
        </div>
        <Field label="Briefing"><textarea value={briefing} onChange={e => setBriefing(e.target.value)} className={`${textareaCls} min-h-[14rem] !text-base sm:!text-sm`} placeholder="Wat moet er gebeuren, voor wanneer, in welk formaat…" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Klant</span><ClientPicker clients={clients} value={client} onChange={setClient} matched={matched} /></div>
          <Field label="Deadline"><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} /></Field>
        </div>
        <div><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Bijlagen</span><PendingFiles items={files} onChange={setFiles} busy={!!busy} /></div>

        <section aria-label="Freelancer" className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Freelancer *{chosen ? ` — ${chosen.name}` : ''}</span>
          <FreelancerSuggestions all={freelancers} value={freelancerId} onChange={setFreelancerId}
            discipline={discipline} deadline={deadline} description={[title, briefing].filter(Boolean).join('\n\n')} />
        </section>

        <ErrorLine>{error}</ErrorLine>
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:static md:justify-end md:border-0 md:bg-transparent md:p-0"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button className="!h-12 flex-1 md:!h-9 md:flex-none" busy={busy === 'concept'} disabled={!!busy} onClick={() => submit(false)}>Opslaan als concept</Button>
          <Button variant="primary" className="!h-12 flex-1 md:!h-9 md:flex-none" busy={busy === 'delen'} disabled={!!busy} onClick={() => submit(true)}>Delen</Button>
        </div>
      </div>
      {reveal && chosen && <LinkReveal name={chosen.name} url={reveal.url} pin={reveal.pin} onClose={() => router.push(reveal.then)} />}
    </PageScroll>
  )
}
