'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, Search, X } from 'lucide-react'
import { Button, Field, inputCls } from '@/components/materiaal/ui'
import { Modal } from '@/components/poolwagens/ui'
import { Chip } from '../internal/ui'
import { DISCIPLINES, FSTATUS_LABEL, LABEL, isAvailable, lastAssignment, ratingOf, type FStatus, type PFreelancer } from './data'
import { Avail, Initials, MultiSelect, Rating, Toggle, fmt } from './bits'
import { useProto } from './store'

// Freelancerlijst: één zoekbalk, Discipline ▾, Status ▾ en "Beschikbaar".
// Standaard iedereen behalve inactief. Vier kolommen; klik op een kop om te sorteren.

type Sort = 'naam' | 'beoordeling' | 'beschikbaarheid' | 'laatste'
const DEFAULT_STATUS: FStatus[] = ['vast', 'proefopdracht', 'kandidaat']
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function List() {
  const { freelancers, assignments, go } = useProto()
  const [q, setQ] = useState('')
  const [disc, setDisc] = useState<string[]>([])
  const [status, setStatus] = useState<FStatus[]>(DEFAULT_STATUS)
  const [now, setNow] = useState(false)
  const [sort, setSort] = useState<Sort>('beoordeling')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    const avOrder = (f: PFreelancer) => (isAvailable(f) ? 0 : f.availability === 'beperkt' ? 1 : 2)
    return freelancers
      .filter(f => status.includes(f.status))
      .filter(f => disc.length === 0 || disc.some(d => f.disciplines.includes(d)))
      .filter(f => !now || isAvailable(f))
      .filter(f => { const hay = norm([f.name, f.notes, ...f.disciplines.map(d => LABEL[d])].join(' ')); return words.every(w => hay.includes(w)) })
      .map(f => ({ f, r: ratingOf(f, assignments), last: lastAssignment(f, assignments) }))
      .sort((a, b) => {
        const byName = a.f.name.localeCompare(b.f.name, 'nl')
        if (sort === 'naam') return byName
        if (sort === 'beschikbaarheid') return avOrder(a.f) - avOrder(b.f) || byName
        if (sort === 'laatste') return (b.last?.changedAt ?? '').localeCompare(a.last?.changedAt ?? '') || byName
        return (b.r.value ?? -1) - (a.r.value ?? -1) || b.r.count - a.r.count || byName
      })
  }, [freelancers, assignments, q, disc, status, now, sort])

  const changed = q || disc.length || now || status.length !== DEFAULT_STATUS.length || !DEFAULT_STATUS.every(s => status.includes(s))
  const reset = () => { setQ(''); setDisc([]); setStatus(DEFAULT_STATUS); setNow(false) }
  const statusCount = (s: FStatus) => freelancers.filter(f => f.status === s).length


  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Zoek op naam, discipline of notitie" aria-label="Zoeken"
          className={`${inputCls} !h-11 !pl-9 !text-base sm:!text-sm`} />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Wissen" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-zinc-500 hover:text-zinc-200"><X size={16} /></button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect label="Discipline" value={disc} onChange={setDisc}
          options={DISCIPLINES.map(d => ({ key: d.key, label: d.label, count: freelancers.filter(f => f.disciplines.includes(d.key) && f.status !== 'inactief').length }))} />
        <MultiSelect label="Status" value={status} onChange={v => setStatus((v.length ? v : DEFAULT_STATUS) as FStatus[])}
          summary={status.length === 4 ? 'Status: iedereen' : status.length === 3 && !status.includes('inactief') ? 'Status' : `Status · ${status.map(s => FSTATUS_LABEL[s]).join(', ')}`}
          options={(Object.keys(FSTATUS_LABEL) as FStatus[]).map(s => ({ key: s, label: FSTATUS_LABEL[s], count: statusCount(s) }))} />
        <Toggle on={now} onChange={setNow}>Nu beschikbaar</Toggle>
        {changed ? <button type="button" onClick={reset} className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-200">Wissen</button> : null}
        <span className="ml-auto text-sm text-zinc-500">{rows.length} {rows.length === 1 ? 'freelancer' : 'freelancers'}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-400">
          Niemand gevonden. {changed && <button type="button" onClick={reset} className="text-[#5fbf64] hover:underline">Filters wissen</button>}
        </div>
      ) : (<>
        {/* Desktop: tabel */}
        <table className="hidden w-full table-fixed text-left text-sm md:table">
          <thead className="text-[11px] text-zinc-500">
            <tr className="border-b border-zinc-800">
              <Head sort={sort} setSort={setSort} k="naam" className="w-[38%]">Naam</Head>
              <Head sort={sort} setSort={setSort} k="beoordeling" className="w-[14%]">Beoordeling</Head>
              <Head sort={sort} setSort={setSort} k="beschikbaarheid" className="w-[20%]">Beschikbaarheid</Head>
              <Head sort={sort} setSort={setSort} k="laatste" className="w-[28%]">Laatste opdracht</Head>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, last }) => (
              <tr key={f.id} tabIndex={0} onClick={() => go('profiel', { id: f.id })} onKeyDown={e => { if (e.key === 'Enter') go('profiel', { id: f.id }) }}
                className="cursor-pointer border-b border-zinc-900 align-top hover:bg-zinc-900/60 focus:outline-none focus-visible:bg-zinc-900">
                <td className="py-3 pr-4">
                  <span className="flex min-w-0 items-start gap-3">
                    <Initials name={f.name} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-100">{f.name}{f.status !== 'vast' && <span className="ml-2 text-xs font-normal text-zinc-500">{FSTATUS_LABEL[f.status]}</span>}</span>
                      <span className="block truncate text-xs text-zinc-400">{f.disciplines.map(d => LABEL[d]).join(' · ')}</span>
                    </span>
                  </span>
                </td>
                <td className="py-3 pr-4"><Rating f={f} all={assignments} /></td>
                <td className="py-3 pr-4"><Avail f={f} short /></td>
                <td className="py-3 pr-4">{last ? <><span className="block text-zinc-300">{fmt.date(last.changedAt)}</span><span className="block truncate text-xs text-zinc-500">{last.title}</span></> : <span className="text-zinc-600">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Gsm: kaarten */}
        <div className="flex items-center justify-end gap-2 md:hidden">
          <label className="text-sm text-zinc-500" htmlFor="proto-sort">Sorteren</label>
          <select id="proto-sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className={`${inputCls} !h-10 !w-auto !text-base`}>
            <option value="beoordeling">Beoordeling</option><option value="beschikbaarheid">Beschikbaarheid</option><option value="laatste">Laatste opdracht</option><option value="naam">Naam</option>
          </select>
        </div>
        <ul className="space-y-2 md:hidden">
          {rows.map(({ f, last }) => (
            <li key={f.id}>
              <button type="button" onClick={() => go('profiel', { id: f.id })} className="flex w-full gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left active:bg-zinc-800">
                <Initials name={f.name} size={40} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate font-medium text-zinc-100">{f.name}</span><span className="block truncate text-xs text-zinc-400">{f.disciplines.map(d => LABEL[d]).join(' · ')}{f.status !== 'vast' ? ` — ${FSTATUS_LABEL[f.status]}` : ''}</span></span>
                    <Rating f={f} all={assignments} inline />
                  </span>
                  <span className="flex items-center justify-between gap-2"><Avail f={f} short />{last && <span className="truncate text-xs text-zinc-500">{fmt.date(last.changedAt)}</span>}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>)}

      <button type="button" onClick={() => setAdding(true)} className="text-sm text-zinc-400 hover:text-zinc-200">+ Freelancer toevoegen</button>
      {adding && <AddFreelancer onClose={() => setAdding(false)} />}
    </div>
  )
}

function Head({ k, sort, setSort, children, className = '' }: { k: Sort; sort: Sort; setSort: (s: Sort) => void; children: string; className?: string }) {
  return (
    <th className={`py-2 pr-4 font-medium ${className}`} aria-sort={sort === k ? (k === 'naam' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => setSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-zinc-200 ${sort === k ? 'text-zinc-200' : ''}`}>
        {children}{sort === k && <ArrowDown size={12} aria-hidden />}
      </button>
    </th>
  )
}

function AddFreelancer({ onClose }: { onClose: () => void }) {
  const { addFreelancer, go } = useProto()
  const [name, setName] = useState('')
  const [disc, setDisc] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  function save() {
    if (!name.trim()) return setErr('Geef een naam.')
    const id = addFreelancer({ name: name.trim(), disciplines: disc, phone, email })
    go('profiel', { id })
  }
  return (
    <Modal title="Freelancer toevoegen" onClose={onClose} footer={<><Button onClick={onClose}>Annuleren</Button><Button variant="primary" onClick={save}>Toevoegen</Button></>}>
      <Field label="Naam"><input autoFocus value={name} onChange={e => setName(e.target.value)} className={`${inputCls} !h-11 !text-base sm:!h-9 sm:!text-sm`} /></Field>
      <div><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Wat doet hij of zij?</span>
        <div className="flex flex-wrap gap-1.5">{DISCIPLINES.map(d => <Chip key={d.key} active={disc.includes(d.key)} onClick={() => setDisc(disc.includes(d.key) ? disc.filter(x => x !== d.key) : [...disc, d.key])}>{d.label}</Chip>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefoon"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
        <Field label="E-mail"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`${inputCls} !text-base sm:!text-sm`} /></Field>
      </div>
      <p className="text-xs text-zinc-500">Start als kandidaat. Tarief, portfolio en notities vul je later aan op het profiel.</p>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </Modal>
  )
}
