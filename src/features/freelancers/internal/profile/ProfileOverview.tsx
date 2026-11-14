'use client'

import { useState } from 'react'
import { Field, Select, inputCls, textareaCls } from '@/components/materiaal/ui'
import { internalApi } from '../api'
import { AvailabilityDot, Chip, Stars } from '../ui'
import { availabilitySource, rateText, shortDate } from '../format'
import type { Discipline, Freelancer } from '../types'
import EditableCard from './EditableCard'

// Tabblad Overzicht: kaarten die elk apart te bewerken zijn.
export default function ProfileOverview({ f, disciplines, canManage, onChange }: {
  f: Freelancer; disciplines: Discipline[]; canManage: boolean; onChange: (f: Freelancer) => void
}) {
  const [c, setC] = useState({ name: f.name, phone: f.phone ?? '', email: f.email ?? '', disciplines: f.disciplines })
  const [r, setR] = useState({ amount: f.rate_amount != null ? String(f.rate_amount) : '', unit: f.rate_unit ?? '', note: f.rate_note ?? '' })
  const [av, setAv] = useState({ availability: f.availability, from: f.available_from ?? '' })
  const [rating, setRating] = useState({ value: f.overall_rating, note: f.overall_rating_note ?? '' })
  const [links, setLinks] = useState(f.portfolio_links.map(l => `${l.label} | ${l.url}`).join('\n'))
  const [notes, setNotes] = useState(f.notes ?? '')
  const save = async (body: object) => onChange(await internalApi.update(f.id, body))
  const empty = <span className="text-sm text-zinc-500">—</span>

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EditableCard title="Contact" canEdit={canManage}
        view={<div className="space-y-1 text-sm text-zinc-200"><div>{f.phone || empty}</div><div className="break-all">{f.email || empty}</div></div>}
        edit={<>
          <Field label="Naam"><input value={c.name} onChange={e => setC({ ...c, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Telefoon"><input type="tel" value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} className={inputCls} /></Field>
          <Field label="E-mail"><input type="email" value={c.email} onChange={e => setC({ ...c, email: e.target.value })} className={inputCls} /></Field>
          <div className="flex flex-wrap gap-1.5">{disciplines.map(d => <Chip key={d.key} active={c.disciplines.includes(d.key)}
            onClick={() => setC({ ...c, disciplines: c.disciplines.includes(d.key) ? c.disciplines.filter(x => x !== d.key) : [...c.disciplines, d.key] })}>{d.label}</Chip>)}</div>
        </>}
        onSave={() => save({ name: c.name, phone: c.phone || null, email: c.email || null, disciplines: c.disciplines })} />

      <EditableCard title="Tarief" canEdit={canManage}
        view={<p className="text-sm text-zinc-200">{rateText(f) || empty}</p>}
        edit={<>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bedrag (€)"><input inputMode="decimal" value={r.amount} onChange={e => setR({ ...r, amount: e.target.value })} className={inputCls} /></Field>
            <Field label="Per"><Select value={r.unit} onChange={e => setR({ ...r, unit: e.target.value as typeof r.unit })}>
              <option value="">—</option><option value="uur">uur</option><option value="dag">dag</option><option value="project">project</option></Select></Field>
          </div>
          <Field label="Toelichting"><input value={r.note} onChange={e => setR({ ...r, note: e.target.value })} className={inputCls} placeholder="bv. €350/dag, negotiable" /></Field>
        </>}
        onSave={() => {
          const amount = r.amount.trim() ? Number(r.amount.replace(',', '.')) : null
          if (amount != null && (Number.isNaN(amount) || !r.unit)) return Promise.reject(new Error('Geef een geldig bedrag én een eenheid.'))
          return save({ rate_amount: amount, rate_unit: amount != null ? r.unit : null, rate_note: r.note || null })
        }} />

      <EditableCard title="Beschikbaarheid" canEdit={canManage}
        view={<div className="text-sm text-zinc-200"><AvailabilityDot value={f.availability} />
          {f.available_from && f.availability !== 'beschikbaar' && <span className="text-zinc-500"> · vanaf {shortDate(f.available_from)}</span>}
          {availabilitySource(f) && <p className="mt-1 text-xs text-zinc-500">{availabilitySource(f)}</p>}</div>}
        edit={<>
          <Field label="Beschikbaarheid"><Select value={av.availability} onChange={e => setAv({ ...av, availability: e.target.value as Freelancer['availability'] })}>
            <option value="beschikbaar">Beschikbaar</option><option value="beperkt">Beperkt</option><option value="niet_beschikbaar">Niet beschikbaar</option></Select></Field>
          {av.availability !== 'beschikbaar' && <Field label="Weer beschikbaar vanaf"><input type="date" value={av.from} onChange={e => setAv({ ...av, from: e.target.value })} className={inputCls} /></Field>}
        </>}
        onSave={() => save({ availability: av.availability, available_from: av.availability === 'beschikbaar' ? null : av.from || null })} />

      <EditableCard title="Beoordeling" canEdit={canManage}
        view={<div className="space-y-1 text-sm">
          <div className="flex items-center gap-2"><Stars value={f.overall_rating} /><span className="text-zinc-400">{f.overall_rating ? `${f.overall_rating}/5 (team)` : 'nog geen totaalcijfer'}</span></div>
          {f.stats?.review_avg != null && <p className="text-zinc-400">Opdrachten: {String(f.stats.review_avg).replace('.', ',')} gemiddeld over {f.stats.review_count}</p>}
          {f.overall_rating_note && <p className="whitespace-pre-wrap text-zinc-300">{f.overall_rating_note}</p>}
        </div>}
        edit={<>
          <Stars value={rating.value} onChange={v => setRating({ ...rating, value: v })} size={24} label="Totaalcijfer" />
          <Field label="Toelichting (intern)"><textarea value={rating.note} onChange={e => setRating({ ...rating, note: e.target.value })} className={textareaCls} /></Field>
        </>}
        onSave={async () => onChange(await internalApi.rating(f.id, rating.value, rating.note || null))} />

      <EditableCard title="Portfolio" canEdit={canManage}
        view={f.portfolio_links.length ? <ul className="space-y-1 text-sm">{f.portfolio_links.map(l => <li key={l.url} className="break-all"><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#5fbf64] hover:underline">{l.label}</a></li>)}</ul> : empty}
        edit={<Field label="Eén link per regel: label | https://…"><textarea value={links} onChange={e => setLinks(e.target.value)} className={textareaCls} /></Field>}
        onSave={() => save({ portfolio_links: links.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const [label, url] = l.includes('|') ? l.split('|').map(x => x.trim()) : ['Portfolio', l]
          return { label: label || 'Portfolio', url }
        }) })} />

      <EditableCard title="Notities (intern)" canEdit={canManage}
        view={f.notes ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{f.notes}</p> : empty}
        edit={<textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${textareaCls} min-h-[8rem]`} aria-label="Notities" />}
        onSave={() => save({ notes: notes || null })} />
    </div>
  )
}
