'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { ErrorLine, PrimaryButton, inputCls, send } from '@/components/materiaal/ui'
import { planMoveTo, type Plan, type Step } from '@/lib/gear/inventory'
import { STATUS_LABEL, UNIT_STATUSES, type UnitStatus } from '@/lib/gear/status'
import type { GearCatalog, GearItemHistory } from '@/lib/gear/types'

// Acties op meerdere aangevinkte items: naar een kit, naar een categorie (los),
// status, verwijderen. Verplaatsen loopt via dezelfde weg als slepen (venster
// voor komende boekingen, ongedaan maken). Verwijderen vraagt altijd eerst
// bevestiging en noemt de items die blijven omdat ze boekingen hebben.

export default function BulkBar({ ids, catalog, run, reload, onClear, notify }: {
  ids: string[]
  catalog: GearCatalog
  run: (plan: Plan | null) => Promise<void>
  reload: () => Promise<void>
  onClear: () => void
  notify: (message: string, tone?: 'info' | 'warn') => void
}) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [status, setStatus] = useState<UnitStatus>('defect')
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ protectedNames: string[]; deletable: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = (id: string) => catalog.items.find(i => i.id === id)?.name ?? id

  function moveAll(to: { kitId: string } | { categoryId: string }, target: string) {
    const steps: Step[] = ids.flatMap(id => planMoveTo(catalog, id, to)?.steps ?? [])
    if (steps.length) run({ steps, target }).then(onClear)
  }

  async function applyStatus() {
    setBusy(true); setError('')
    const failed: string[] = []
    for (const id of ids) {
      try { await send(`/api/materiaal/items/${id}/status`, 'POST', { status, note }) }
      catch (e) { failed.push(`${name(id)}: ${e instanceof Error ? e.message : 'mislukt'}`) }
    }
    await reload(); setBusy(false); setStatusOpen(false); setNote('')
    if (failed.length) setError(failed.join(' · '))
    else { notify(`${ids.length} items op ${STATUS_LABEL[status].toLowerCase()} gezet.`); onClear() }
  }

  // Eerst kijken welke items boekingen hebben: die kunnen niet weg.
  async function prepareDelete() {
    setBusy(true); setError('')
    try {
      const histories = await Promise.all(ids.map(id => send<GearItemHistory>(`/api/materiaal/items/${id}/history`, 'GET')))
      const protectedIds = ids.filter((_, i) => histories[i].bookings.length > 0)
      setConfirmDelete({ protectedNames: protectedIds.map(name), deletable: ids.filter(id => !protectedIds.includes(id)) })
    } catch (e) { setError(e instanceof Error ? e.message : 'Kon de boekingen niet nakijken.') }
    setBusy(false)
  }

  async function doDelete() {
    if (!confirmDelete) return
    setBusy(true); setError('')
    const failed: string[] = []
    for (const id of confirmDelete.deletable) {
      try { await send('/api/materiaal/items', 'DELETE', { id }) } catch (e) { failed.push(`${name(id)}: ${e instanceof Error ? e.message : 'mislukt'}`) }
    }
    await reload(); setBusy(false)
    const done = confirmDelete.deletable.length - failed.length
    setConfirmDelete(null)
    if (failed.length) setError(failed.join(' · '))
    else { notify(`${done} ${done === 1 ? 'item' : 'items'} verwijderd.`); onClear() }
  }

  const cats = [...catalog.categories].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="sticky bottom-0 z-30 mt-4 rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur p-3 space-y-2 shadow-2xl"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-100">{ids.length} geselecteerd</span>
        {busy && <Loader2 size={13} className="animate-spin text-zinc-500" />}
        <select value="" aria-label="Naar kit" className={`${inputCls} w-auto`} onChange={e => {
          const k = catalog.kits.find(x => x.id === e.target.value); if (k) moveAll({ kitId: k.id }, k.name)
        }}>
          <option value="">Naar kit…</option>
          {cats.map(c => (
            <optgroup key={c.id} label={c.name}>
              {catalog.kits.filter(k => k.category_id === c.id).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select value="" aria-label="Naar categorie" className={`${inputCls} w-auto`} onChange={e => {
          const c = cats.find(x => x.id === e.target.value); if (c) moveAll({ categoryId: c.id }, `${c.name} (los)`)
        }}>
          <option value="">Naar categorie…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setStatusOpen(o => !o)} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:border-zinc-500">Status…</button>
        <button onClick={prepareDelete} disabled={busy} className="px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 disabled:opacity-50">Verwijderen</button>
        <button onClick={onClear} aria-label="Selectie wissen" className="ml-auto text-zinc-500 hover:text-zinc-200"><X size={15} /></button>
      </div>
      {statusOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={e => setStatus(e.target.value as UnitStatus)} aria-label="Nieuwe status" className={`${inputCls} w-auto`}>
            {UNIT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Notitie (nodig bij defect/beperkt)" aria-label="Notitie" className={`${inputCls} flex-1 min-w-[12rem]`} />
          <PrimaryButton onClick={applyStatus} busy={busy} disabled={(status === 'defect' || status === 'beperkt') && !note.trim()}>Toepassen</PrimaryButton>
        </div>
      )}
      {confirmDelete && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-2.5 space-y-1.5 text-sm">
          <p className="text-zinc-200">{confirmDelete.deletable.length} {confirmDelete.deletable.length === 1 ? 'item' : 'items'} verwijderen?</p>
          {confirmDelete.protectedNames.length > 0 && (
            <p className="text-xs text-amber-300">
              Blijven staan (hebben boekingen; zet ze op &ldquo;uit dienst&rdquo;): {confirmDelete.protectedNames.join(', ')}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={doDelete} disabled={busy || confirmDelete.deletable.length === 0}
              className="px-2.5 py-1 rounded bg-red-700 text-white text-xs disabled:opacity-40">Ja, verwijderen</button>
            <button onClick={() => setConfirmDelete(null)} className="text-xs text-zinc-500">Nee</button>
          </div>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  )
}
