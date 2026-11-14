'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/poolwagens/ui'
import { Button, ErrorLine, Field, Select, inputCls, textareaCls } from '@/components/materiaal/ui'
import { internalApi } from './api'
import { Chip } from './ui'
import type { Discipline, Freelancer } from './types'

// "+ Freelancer": alleen naam en "Wat" (minstens één discipline) zijn
// verplicht. Na opslaan → het profiel (via onCreated).
export default function AddFreelancerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (f: Freelancer) => void }) {
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [name, setName] = useState('')
  const [wat, setWat] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Freelancer['status']>('kandidaat')
  const [rateAmount, setRateAmount] = useState('')
  const [rateUnit, setRateUnit] = useState<'' | 'uur' | 'dag' | 'project'>('')
  const [portfolio, setPortfolio] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { internalApi.disciplines().then(setDisciplines).catch(() => {}) }, [])

  async function save() {
    if (!name.trim() || wat.length === 0) { setError('Vul een naam in en kies minstens één discipline.'); return }
    const amount = rateAmount.trim() ? Number(rateAmount.replace(',', '.')) : null
    if (amount != null && (Number.isNaN(amount) || !rateUnit)) { setError('Geef een geldig bedrag én een eenheid, of laat het tarief leeg.'); return }
    setBusy(true); setError('')
    try {
      const f = await internalApi.create({
        name, disciplines: wat, status,
        phone: phone || null, email: email || null, notes: notes || null,
        rate_amount: amount, rate_unit: amount != null ? rateUnit : null,
        portfolio_links: portfolio.trim() ? [{ label: 'Portfolio', url: portfolio.trim() }] : [],
      })
      onCreated(f)
    } catch (err) {
      setError((err as Error).message); setBusy(false)
    }
  }

  return (
    <Modal title="Freelancer toevoegen" onClose={onClose} footer={<>
      <Button onClick={onClose}>Annuleren</Button>
      <Button variant="primary" data-primary busy={busy} onClick={save}>Opslaan</Button>
    </>}>
      <Field label="Naam *"><input autoFocus value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Field>
      <div>
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">Wat * (disciplines)</span>
        <div className="flex flex-wrap gap-1.5">
          {disciplines.map(d => <Chip key={d.key} active={wat.includes(d.key)} onClick={() => setWat(w => w.includes(d.key) ? w.filter(x => x !== d.key) : [...w, d.key])}>{d.label}</Chip>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefoon"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} /></Field>
        <Field label="E-mail"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} /></Field>
        <Field label="Status">
          <Select value={status} onChange={e => setStatus(e.target.value as Freelancer['status'])}>
            <option value="kandidaat">Kandidaat</option><option value="proefopdracht">Proefopdracht</option>
            <option value="vast">Vast</option><option value="inactief">Inactief</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tarief (€)"><input inputMode="decimal" value={rateAmount} onChange={e => setRateAmount(e.target.value)} className={inputCls} /></Field>
          <Field label="Per">
            <Select value={rateUnit} onChange={e => setRateUnit(e.target.value as typeof rateUnit)}>
              <option value="">—</option><option value="uur">uur</option><option value="dag">dag</option><option value="project">project</option>
            </Select>
          </Field>
        </div>
      </div>
      <Field label="Portfolio (link)"><input type="url" value={portfolio} onChange={e => setPortfolio(e.target.value)} placeholder="https://" className={inputCls} /></Field>
      <Field label="Notities"><textarea value={notes} onChange={e => setNotes(e.target.value)} className={textareaCls} /></Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  )
}
