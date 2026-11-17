'use client'

import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Copy, ExternalLink, Mail, Pencil, Phone, Plus, Trash2, X } from 'lucide-react'
import { Button, ErrorLine, Field, Select, inputCls, send, textareaCls } from '@/components/materiaal/ui'
import { Modal } from '@/components/poolwagens/ui'
import { collabStats } from '@/features/freelancers/lib/rows'
import type { Discipline, Freelancer } from './types'
import {
  STATUSES, STATUS_LABEL, formToBody, linkLabel, mailHref, rateText, score, seedForm, telHref,
  type Form, type FormErrors,
} from './logic'
import { Chip, Stars } from './ui'
import { copyText } from './Contact'
import Projects from './Projects'

// Zijpaneel (desktop) of volledig scherm (gsm): alles van één freelancer.
// Bewerken zet het hele paneel in formuliermodus met één Opslaan/Annuleren.
// "+ Freelancer" is hetzelfde paneel, leeg. Wie alleen mag bekijken, ziet
// geen enkele wijzigknop (verborgen, niet uitgeschakeld).

const big = '!h-11 !text-base md:!h-9 md:!text-sm'

export default function Panel({ freelancer, canManage, disciplines, clients, onClose, onSaved, onDeleted, say }: {
  freelancer: Freelancer | null
  canManage: boolean
  disciplines: Discipline[]
  clients: string[]
  onClose: () => void
  onSaved: (f: Freelancer) => void
  onDeleted: (id: string) => void
  say: (s: string) => void
}) {
  const isNew = !freelancer
  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState<Form>(() => seedForm(freelancer))
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [projectCount, setProjectCount] = useState(freelancer?.collab.count ?? 0)
  const labels = Object.fromEntries(disciplines.map(d => [d.key, d.label]))

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !confirmDelete) onClose() }
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [editing, confirmDelete, onClose])

  const upd = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))
  const startEdit = () => { setForm(seedForm(freelancer)); setErrors({}); setError(''); setEditing(true) }
  const cancel = () => { if (isNew) onClose(); else { setEditing(false); setErrors({}); setError('') } }

  async function save() {
    const { errors: errs, body } = formToBody(form)
    setErrors(errs)
    if (!body) { setError('Controleer de velden in het rood.'); return }
    setBusy(true); setError('')
    try {
      const saved = isNew
        ? await send<Freelancer>('/api/freelancers', 'POST', body)
        : await send<Freelancer>(`/api/freelancers/${freelancer.id}`, 'PATCH', body)
      onSaved(saved)
      setEditing(false)
      say(isNew ? 'Freelancer toegevoegd' : 'Opgeslagen')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan lukte niet.')
    } finally { setBusy(false) }
  }

  async function setArchived(archived: boolean) {
    if (!freelancer) return
    setBusy(true); setError('')
    try {
      const f = await send<Freelancer>(`/api/freelancers/${freelancer.id}/archive`, archived ? 'POST' : 'DELETE')
      onSaved(f)
      say(archived ? 'Gearchiveerd' : 'Teruggezet')
      if (archived) onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Dat lukte niet.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!freelancer) return
    setBusy(true); setError('')
    try {
      await send(`/api/freelancers/${freelancer.id}`, 'DELETE')
      setConfirmDelete(false)
      onDeleted(freelancer.id)
      say('Verwijderd')
    } catch (e) { setConfirmDelete(false); setError(e instanceof Error ? e.message : 'Verwijderen lukte niet.') } finally { setBusy(false) }
  }

  const title = isNew ? 'Nieuwe freelancer' : freelancer.name

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 hidden bg-black/50 md:block" onClick={() => { if (!editing) onClose() }} />
      <aside role="dialog" aria-modal="true" aria-label={title}
        className="relative flex h-[100dvh] w-full flex-col bg-zinc-950 md:w-[500px] md:border-l md:border-zinc-800 md:shadow-2xl">
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-800 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-5">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-100">{editing && !isNew ? `${freelancer.name} bewerken` : title}</h2>
          {!editing && canManage && <Button onClick={startEdit} className="max-md:!h-11"><Pencil size={14} /> Bewerken</Button>}
          <button type="button" onClick={editing ? cancel : onClose} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">
          {error && <ErrorLine>{error}</ErrorLine>}
          {editing
            ? <EditForm form={form} upd={upd} errors={errors} disciplines={disciplines} />
            : freelancer && <View f={freelancer} labels={labels} say={say} />}

          {!editing && freelancer && (
            <Projects freelancer={freelancer} canManage={canManage} clients={clients}
              onChange={list => { setProjectCount(list.length); onSaved({ ...freelancer, collab: collabStats(list) }) }} />
          )}

          {!editing && freelancer && canManage && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
              {freelancer.archived_at
                ? <Button onClick={() => setArchived(false)} busy={busy} className="max-md:!h-11"><ArchiveRestore size={14} /> Terugzetten</Button>
                : <Button onClick={() => setArchived(true)} busy={busy} className="max-md:!h-11"><Archive size={14} /> Archiveren</Button>}
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="max-md:!h-11"><Trash2 size={14} /> Verwijderen</Button>
            </div>
          )}
        </div>

        {editing && (
          <footer className="flex flex-shrink-0 justify-end gap-2 border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
            <Button onClick={cancel} className="max-md:!h-11 max-md:flex-1">Annuleren</Button>
            <Button variant="primary" onClick={save} busy={busy} className="max-md:!h-11 max-md:flex-[2]">{isNew ? 'Toevoegen' : 'Opslaan'}</Button>
          </footer>
        )}
      </aside>

      {confirmDelete && freelancer && (
        <Modal title="Definitief verwijderen?" onClose={() => setConfirmDelete(false)}
          footer={<><Button onClick={() => setConfirmDelete(false)}>Annuleren</Button>
            <Button variant="destructive" data-primary onClick={remove} busy={busy}>Definitief verwijderen</Button></>}>
          <p className="text-sm text-zinc-300">
            <strong className="text-zinc-100">{freelancer.name}</strong>
            {projectCount === 0 ? ' wordt definitief verwijderd.'
              : projectCount === 1 ? ' en 1 samenwerking worden definitief verwijderd.'
              : ` en ${projectCount} samenwerkingen worden definitief verwijderd.`}
            {' '}Dit kan niet ongedaan gemaakt worden.
          </p>
          <p className="text-sm text-zinc-400">Wil je iemand alleen uit de lijst halen? Kies dan <em>Archiveren</em>; de gegevens blijven bewaard.</p>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
      <dt className="pt-px text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-200">{children}</dd>
    </div>
  )
}

function View({ f, labels, say }: { f: Freelancer; labels: Record<string, string>; say: (s: string) => void }) {
  const rate = rateText(f)
  const btn = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-zinc-500 md:min-h-[36px]'
  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm text-zinc-300">{STATUS_LABEL[f.status]}{f.archived_at ? ' · gearchiveerd' : ''} · {f.disciplines.map(d => labels[d] ?? d).join(' · ') || '—'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {f.overall_rating != null ? <Stars value={f.overall_rating} /> : <span className="text-zinc-500">Nog geen beoordeling</span>}
          {f.collab.avg != null && <span className="text-zinc-400">samenwerkingen {score(f.collab.avg)} ({f.collab.scored})</span>}
        </div>
        {f.overall_rating_note && <p className="text-sm italic text-zinc-400">“{f.overall_rating_note}”</p>}
      </div>
      {(f.phone || f.email) && (
        <div className="flex flex-wrap gap-2">
          {f.phone && <a href={telHref(f.phone)} className={btn}><Phone size={15} /> Bellen</a>}
          {f.email && <a href={mailHref(f.email)} className={btn}><Mail size={15} /> Mailen</a>}
        </div>
      )}
      <dl className="space-y-2.5">
        <Row label="Telefoon">{f.phone ?? <span className="text-zinc-600">—</span>}</Row>
        <Row label="E-mail">{f.email
          ? <span className="inline-flex items-center gap-1">{f.email}
              <button type="button" aria-label="E-mailadres kopiëren" onClick={async () => say((await copyText(f.email!)) ? 'Gekopieerd' : 'Kopiëren lukte niet')}
                className="flex h-11 w-11 items-center justify-center rounded text-zinc-500 hover:text-zinc-200 md:h-8 md:w-8"><Copy size={13} /></button></span>
          : <span className="text-zinc-600">—</span>}</Row>
        <Row label="Tarief">{rate
          ? <>{rate}{f.rate_amount != null && f.rate_note ? <span className="block text-zinc-400">{f.rate_note}</span> : null}</>
          : <span className="text-zinc-600">—</span>}</Row>
        <Row label="Portfolio">{f.portfolio_links.length
          ? <span className="flex flex-col gap-1">{f.portfolio_links.map(l => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 text-[#5fbf64] hover:underline md:min-h-0">{linkLabel(l)} <ExternalLink size={12} /></a>))}</span>
          : <span className="text-zinc-600">—</span>}</Row>
        <Row label="Notities">{f.notes ? <span className="whitespace-pre-wrap">{f.notes}</span> : <span className="text-zinc-600">—</span>}</Row>
      </dl>
    </section>
  )
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1 text-xs text-red-400">{children}</p> : null
}

function EditForm({ form, upd, errors, disciplines }: {
  form: Form; upd: <K extends keyof Form>(k: K, v: Form[K]) => void; errors: FormErrors; disciplines: Discipline[]
}) {
  const links = form.portfolio_links
  return (
    <div className="space-y-4">
      <Field label="Naam *">
        <input autoFocus value={form.name} onChange={e => upd('name', e.target.value)} className={`${inputCls} ${big}`} aria-invalid={!!errors.name} />
        <FieldError>{errors.name}</FieldError>
      </Field>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Wat *</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wat">
          {disciplines.map(d => <Chip key={d.key} active={form.disciplines.includes(d.key)}
            onClick={() => upd('disciplines', form.disciplines.includes(d.key) ? form.disciplines.filter(x => x !== d.key) : [...form.disciplines, d.key])}>{d.label}</Chip>)}
        </div>
        <FieldError>{errors.disciplines}</FieldError>
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
          {STATUSES.map(s => <Chip key={s} active={form.status === s} onClick={() => upd('status', s)}>{STATUS_LABEL[s]}</Chip>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefoon"><input type="tel" value={form.phone} onChange={e => upd('phone', e.target.value)} className={`${inputCls} ${big}`} /></Field>
        <Field label="E-mail"><input type="email" value={form.email} onChange={e => upd('email', e.target.value)} className={`${inputCls} ${big}`} aria-invalid={!!errors.email} /><FieldError>{errors.email}</FieldError></Field>
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Tarief</span>
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <input inputMode="decimal" value={form.rate_amount} onChange={e => upd('rate_amount', e.target.value)} placeholder="Bedrag (€)" aria-label="Bedrag" className={`${inputCls} ${big}`} aria-invalid={!!errors.rate} />
          <Select value={form.rate_unit} onChange={e => upd('rate_unit', e.target.value as Form['rate_unit'])} aria-label="Eenheid" className={big}>
            <option value="">Eenheid</option><option value="uur">per uur</option><option value="dag">per dag</option><option value="project">per project</option>
          </Select>
        </div>
        <input value={form.rate_note} onChange={e => upd('rate_note', e.target.value)} placeholder="Notitie, bv. €250 halve dag" aria-label="Notitie bij het tarief" className={`${inputCls} ${big} mt-2`} />
        <FieldError>{errors.rate}</FieldError>
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Beoordeling</span>
        <Stars value={form.overall_rating} onChange={v => upd('overall_rating', v)} />
        <input value={form.overall_rating_note} onChange={e => upd('overall_rating_note', e.target.value)} placeholder="Waarom deze beoordeling?" aria-label="Notitie bij de beoordeling" className={`${inputCls} ${big} mt-2`} />
      </div>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Portfolio</span>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[8rem_1fr_auto]">
              <input value={l.label} onChange={e => upd('portfolio_links', links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label (optioneel)" aria-label={`Label link ${i + 1}`} className={`${inputCls} ${big} max-sm:col-span-2`} />
              <input type="url" value={l.url} onChange={e => upd('portfolio_links', links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" aria-label={`Link ${i + 1}`} className={`${inputCls} ${big}`} />
              <button type="button" aria-label={`Link ${i + 1} weghalen`} onClick={() => upd('portfolio_links', links.filter((_, j) => j !== i))}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:h-9 md:w-9"><X size={15} /></button>
            </div>
          ))}
          <button type="button" onClick={() => upd('portfolio_links', [...links, { label: '', url: '' }])} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 md:min-h-[32px]"><Plus size={14} /> Link toevoegen</button>
        </div>
        <FieldError>{errors.portfolio}</FieldError>
      </div>
      <Field label="Notities"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} className={`${textareaCls} min-h-[7rem] !text-base md:!text-sm`} /></Field>
    </div>
  )
}
