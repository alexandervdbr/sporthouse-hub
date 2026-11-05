'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button, ErrorLine, IconButton, PrimaryButton, Select, inputCls, send } from '@/components/materiaal/ui'
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
        <span className="text-sm font-medium text-zinc-100 whitespace-nowrap">{ids.length} geselecteerd</span>
        {busy && <Loader2 size={13} className="animate-spin text-zinc-500" />}
        <Select value="" aria-label="Naar kit" wrapperClassName="w-44" onChange={e => {
          const k = catalog.kits.find(x => x.id === e.target.value); if (k) moveAll({ kitId: k.id }, k.name)
        }}>
          <option value="">Naar kit…</option>
          {cats.map(c => (
            <optgroup key={c.id} label={c.name}>
              {catalog.kits.filter(k => k.category_id === c.id).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </optgroup>
          ))}
        </Select>
        <Select value="" aria-label="Naar categorie" wrapperClassName="w-44" onChange={e => {
          const c = cats.find(x => x.id === e.target.value); if (c) moveAll({ categoryId: c.id }, `${c.name} (los)`)
        }}>
          <option value="">Naar categorie…</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button size="md" aria-pressed={statusOpen} onClick={() => setStatusOpen(o => !o)}>Status…</Button>
        <Button size="md" variant="danger" onClick={prepareDelete} disabled={busy}>Verwijderen</Button>
        <span className="ml-auto"><IconButton label="Selectie wissen" onClick={onClear}><X size={15} /></IconButton></span>
      </div>
      {statusOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onChange={e => setStatus(e.target.value as UnitStatus)} aria-label="Nieuwe status" wrapperClassName="w-36">
            {UNIT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
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
            <Button size="sm" variant="destructive" onClick={doDelete} disabled={busy || confirmDelete.deletable.length === 0}>Ja, verwijderen</Button>
            <Button size="sm" variant="text" onClick={() => setConfirmDelete(null)}>Nee</Button>
          </div>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  )
}
