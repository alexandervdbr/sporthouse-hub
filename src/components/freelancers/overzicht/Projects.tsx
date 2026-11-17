'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, ErrorLine, inputCls, send, textareaCls } from '@/components/materiaal/ui'
import type { Freelancer, Project } from './types'
import { Stars } from './ui'

// Samenwerkingen: eerdere projecten met deze freelancer. Eén verzoek als het
// paneel opengaat; toevoegen, bewerken en verwijderen elk apart opgeslagen,
// los van het profielformulier. Het gemiddelde van de scores komt in de lijst
// naast de handmatige beoordeling, nooit in de plaats ervan.

const big = '!h-11 !text-base md:!h-9 md:!text-sm'

interface Draft { project_name: string; client_name: string; date: string; score: number | null; notes: string }
const empty: Draft = { project_name: '', client_name: '', date: '', score: null, notes: '' }
const toDraft = (p: Project): Draft => ({ project_name: p.project_name, client_name: p.client_name ?? '', date: p.date ?? '', score: p.score, notes: p.notes ?? '' })
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
const byDate = (a: Project, b: Project) => (b.date ?? '').localeCompare(a.date ?? '') || b.created_at.localeCompare(a.created_at)

export default function Projects({ freelancer, canManage, clients, onChange }: {
  freelancer: Freelancer; canManage: boolean; clients: string[]; onChange: (list: Project[]) => void
}) {
  const [list, setList] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | 'nieuw' | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const base = `/api/freelancers/${freelancer.id}/projects`

  useEffect(() => {
    let live = true
    send<Project[]>(base, 'GET').then(d => { if (live) setList(d) }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Kon de samenwerkingen niet ophalen.') })
    return () => { live = false }
  }, [base])

  const commit = (next: Project[]) => { const sorted = [...next].sort(byDate); setList(sorted); onChange(sorted) }

  async function save(d: Draft, id: string | 'nieuw') {
    const body = { project_name: d.project_name.trim(), client_name: d.client_name.trim() || null, date: d.date || null, score: d.score, notes: d.notes.trim() || null }
    if (!body.project_name) throw new Error('Geef het project een naam.')
    const p = id === 'nieuw' ? await send<Project>(base, 'POST', body) : await send<Project>(`${base}/${id}`, 'PATCH', body)
    commit(id === 'nieuw' ? [...(list ?? []), p] : (list ?? []).map(x => (x.id === id ? p : x)))
    setEditing(null)
  }

  async function remove(id: string) {
    setError('')
    try { await send(`${base}/${id}`, 'DELETE'); commit((list ?? []).filter(x => x.id !== id)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Verwijderen lukte niet.') }
    finally { setConfirm(null) }
  }

  return (
    <section aria-label="Samenwerkingen" className="space-y-2 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">Samenwerkingen{list ? ` (${list.length})` : ''}</h3>
        {canManage && editing !== 'nieuw' && <Button size="sm" onClick={() => setEditing('nieuw')} className="max-md:!h-11"><Plus size={13} /> Toevoegen</Button>}
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {editing === 'nieuw' && <ProjectForm initial={empty} clients={clients} onSave={d => save(d, 'nieuw')} onCancel={() => setEditing(null)} />}
      {!list && !error && <p className="text-sm text-zinc-500">Laden…</p>}
      {list && list.length === 0 && editing !== 'nieuw' && <p className="text-sm text-zinc-500">Nog geen samenwerkingen.</p>}
      <ul className="divide-y divide-zinc-800/80">
        {list?.map(p => editing === p.id
          ? <li key={p.id} className="py-2"><ProjectForm initial={toDraft(p)} clients={clients} onSave={d => save(d, p.id)} onCancel={() => setEditing(null)} /></li>
          : (
            <li key={p.id} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-zinc-100">{p.project_name}{p.score != null && <span className="ml-2 text-amber-300">★ {p.score}</span>}</p>
                <p className="text-xs text-zinc-500">{[p.date && fmtDate(p.date), p.client_name].filter(Boolean).join(' · ') || '—'}</p>
                {p.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-400">{p.notes}</p>}
              </div>
              {canManage && (confirm === p.id
                ? <span className="flex items-center gap-1"><Button size="sm" variant="destructive" onClick={() => remove(p.id)} className="max-md:!h-11">Verwijderen</Button><Button size="sm" onClick={() => setConfirm(null)} className="max-md:!h-11">Nee</Button></span>
                : <span className="flex">
                    <button type="button" aria-label={`${p.project_name} bewerken`} onClick={() => setEditing(p.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:h-8 md:w-8"><Pencil size={14} /></button>
                    <button type="button" aria-label={`${p.project_name} verwijderen`} onClick={() => setConfirm(p.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-red-400 md:h-8 md:w-8"><Trash2 size={14} /></button>
                  </span>)}
            </li>
          ))}
      </ul>
    </section>
  )
}

function ProjectForm({ initial, clients, onSave, onCancel }: { initial: Draft; clients: string[]; onSave: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }))
  async function submit() {
    setBusy(true); setError('')
    try { await onSave(d) } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan lukte niet.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <input autoFocus value={d.project_name} onChange={e => set('project_name', e.target.value)} placeholder="Project *" aria-label="Project" className={`${inputCls} ${big}`} />
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <input list="freelancer-clients" value={d.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Klant (kies of typ)" aria-label="Klant" className={`${inputCls} ${big}`} />
        <input type="date" value={d.date} onChange={e => set('date', e.target.value)} aria-label="Datum" className={`${inputCls} ${big}`} />
        <datalist id="freelancer-clients">{clients.map(c => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="flex items-center gap-2 text-sm text-zinc-500">Score <Stars value={d.score} onChange={v => set('score', v)} label="Score" /></div>
      <textarea value={d.notes} onChange={e => set('notes', e.target.value)} placeholder="Notitie" aria-label="Notitie" className={`${textareaCls} !text-base md:!text-sm`} />
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} className="max-md:!h-11 max-md:flex-1">Annuleren</Button>
        <Button variant="primary" onClick={submit} busy={busy} className="max-md:!h-11 max-md:flex-1">Opslaan</Button>
      </div>
    </div>
  )
}
