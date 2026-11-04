'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Loader2, Package, UserRound, Wrench } from 'lucide-react'
import { ErrorLine, StatusBadge, inputCls, send } from '@/components/materiaal/ui'
import { barLabel } from '@/lib/gear/labels'
import { kitByItem } from '@/lib/gear/kits'
import { effectiveResponsible, responsibleLabel, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import { STATUS_LABEL, type UnitStatus } from '@/lib/gear/status'
import type { GearCatalog, GearItemHistory } from '@/lib/gear/types'
import type { GearAccess } from '@/lib/gear/access'

// Eén voorwerp: wat het is, in welke kit het zit, of het in orde is, en wat
// ermee gebeurd is (boekingen, statuswijzigingen, verhuizen tussen kits).
// Defect of beperkt melden kan iedereen die mag boeken; herstellen en uit
// dienst nemen alleen wie het materiaal beheert.

function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dateTime(iso: string) {
  return new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ItemDetail({ itemId, access }: { itemId: string; access: GearAccess }) {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [history, setHistory] = useState<GearItemHistory | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<UnitStatus | null>(null)

  const loadHistory = useCallback(() => {
    send<GearItemHistory>(`/api/materiaal/items/${itemId}/history`, 'GET').then(setHistory).catch(e => setError(e.message))
  }, [itemId])

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
    loadHistory()
  }, [loadHistory])

  const item = catalog?.items.find(i => i.id === itemId)
  const category = catalog?.categories.find(c => c.id === item?.category_id)
  const kit = catalog && item ? kitByItem(catalog.kits).get(item.id) ?? null : null
  const responsible = catalog && item ? effectiveResponsible(item, kit, new Map(catalog.clients.map(c => [c.id, c]))) : null

  const timeline = useMemo(() => {
    if (!history) return []
    return [
      ...history.bookings.map(b => ({ kind: 'booking' as const, at: b.start_date, key: `b-${b.id}`, b })),
      ...history.status.map(s => ({ kind: 'status' as const, at: s.changed_at, key: `s-${s.id}`, s })),
      ...history.memberships.flatMap(m => [
        { kind: 'in' as const, at: m.added_at, key: `in-${m.kit_id}-${m.added_at}`, m },
        ...(m.removed_at ? [{ kind: 'out' as const, at: m.removed_at, key: `out-${m.kit_id}-${m.removed_at}`, m }] : []),
      ]),
    ].sort((x, y) => y.at.localeCompare(x.at))
  }, [history])

  async function setStatus(status: UnitStatus) {
    if ((status === 'defect' || status === 'beperkt') && !note.trim()) { setError('Schrijf kort wat er mis is.'); return }
    setBusy(status); setError('')
    try {
      const updated = await send<{ id: string; status: UnitStatus; status_note: string | null }>(`/api/materiaal/items/${itemId}/status`, 'POST', { status, note })
      setCatalog(c => c && ({ ...c, items: c.items.map(i => (i.id === itemId ? { ...i, ...updated } : i)) }))
      setNote('')
      loadHistory()
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan mislukt.') }
    setBusy(null)
  }

  if (!catalog) return <div className="p-8">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
  if (!item) return <div className="p-8"><ErrorLine>Dit materiaal bestaat niet (meer).</ErrorLine></div>

  const specs: [string, string | null][] = [
    ['Model', item.model], ['Nummer', item.number], ['Serienummer', item.serial_number],
    ['Labelkleur', item.label_color], ['ND-filter', item.nd_size], ['Notities', item.notes],
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
          <ChevronRight size={14} />
          {kit ? <Link href={`/materiaal/kit/${kit.id}`} className="hover:text-zinc-300">{kit.name}</Link> : <span>{category?.name}</span>}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: category?.color }}>{category?.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-zinc-100">{item.name}</h1>
            <StatusBadge status={item.status} />
          </div>
          {item.status_note && item.status !== 'ok' && <p className="mt-1 text-sm text-zinc-400">{item.status_note}</p>}
          {kit && (
            <p className="mt-1 text-sm text-zinc-400 flex items-center gap-1.5">
              <Package size={13} className="text-zinc-500" /> Zit in kit <Link href={`/materiaal/kit/${kit.id}`} className="underline hover:text-zinc-200">{kit.name}</Link>
            </p>
          )}
        </div>

        {item.warning && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />{item.warning}
          </div>
        )}
        {responsible && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <UserRound size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <span>{RESPONSIBLE_NOTICE}<br /><strong className="font-medium">{responsibleLabel(responsible)}</strong></span>
          </div>
        )}

        {specs.some(([, v]) => v) && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            {specs.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-200 whitespace-pre-line">{v}</dd></div>
            ))}
          </dl>
        )}

        {access.book && (
          <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <p className="section-label">Toestand</p>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder={item.status === 'ok' ? 'Wat is er mis? bv. lens krast' : 'Notitie (optioneel), bv. hersteld door Cameranu'}
              aria-label="Notitie bij de statuswijziging" className={inputCls} />
            {error && <ErrorLine>{error}</ErrorLine>}
            <div className="flex flex-wrap gap-2">
              {(['defect', 'beperkt'] as const).filter(s => s !== item.status).map(s => (
                <StatusButton key={s} onClick={() => setStatus(s)} busy={busy === s}>
                  <Wrench size={12} /> {s === 'defect' ? 'Defect melden' : 'Beperkt bruikbaar melden'}
                </StatusButton>
              ))}
              {access.manageCatalog && item.status !== 'ok' && <StatusButton onClick={() => setStatus('ok')} busy={busy === 'ok'} tone="ok">Hersteld</StatusButton>}
              {access.manageCatalog && item.status !== 'uit_dienst' && <StatusButton onClick={() => setStatus('uit_dienst')} busy={busy === 'uit_dienst'}>Uit dienst nemen</StatusButton>}
            </div>
          </section>
        )}
        {!access.book && error && <ErrorLine>{error}</ErrorLine>}

        <section>
          <p className="section-label mb-2">Geschiedenis</p>
          {!history ? <Loader2 size={16} className="animate-spin text-zinc-600" />
            : timeline.length === 0 ? <p className="text-sm text-zinc-600">Nog niets gebeurd met dit materiaal.</p>
            : (
              <ol className="space-y-1.5">
                {timeline.map(t => (
                  <li key={t.key} className={`flex flex-wrap items-baseline gap-x-2 text-sm ${t.kind === 'booking' && t.b.cancelled_at ? 'text-zinc-600 line-through' : 'text-zinc-400'}`}>
                    {t.kind === 'booking' && <>
                      <span className="tabular-nums text-zinc-500">{shortDate(t.b.start_date)}{t.b.end_date !== t.b.start_date && ` – ${shortDate(t.b.end_date)}`}</span>
                      <span className="text-zinc-300">{barLabel({ personName: t.b.person_name, clientName: t.b.client?.name, clientColor: t.b.client?.color }).text}</span>
                      {t.b.via_kit_name && <span className="text-xs text-zinc-500">via kit {t.b.via_kit_name}</span>}
                      {t.b.note && <span className="text-xs text-zinc-500">· {t.b.note}</span>}
                      {t.b.cancelled_at && <span className="text-xs no-underline">(geannuleerd)</span>}
                    </>}
                    {t.kind === 'status' && <>
                      <span className="tabular-nums text-zinc-500">{dateTime(t.s.changed_at)}</span>
                      <span>{t.s.old_status ? `${STATUS_LABEL[t.s.old_status]} → ` : ''}{STATUS_LABEL[t.s.new_status]}</span>
                      <span className="text-xs text-zinc-500">door {t.s.changed_by_name}{t.s.note ? ` · ${t.s.note}` : ''}</span>
                    </>}
                    {t.kind === 'in' && <>
                      <span className="tabular-nums text-zinc-500">{dateTime(t.m.added_at)}</span>
                      <span>In kit {t.m.kit_name}</span><span className="text-xs text-zinc-500">door {t.m.added_by_name}</span>
                    </>}
                    {t.kind === 'out' && <>
                      <span className="tabular-nums text-zinc-500">{dateTime(t.m.removed_at!)}</span>
                      <span>Uit kit {t.m.kit_name}</span><span className="text-xs text-zinc-500">door {t.m.removed_by_name}</span>
                    </>}
                  </li>
                ))}
              </ol>
            )}
        </section>
      </div>
    </div>
  )
}

function StatusButton({ onClick, busy, tone, children }: { onClick: () => void; busy: boolean; tone?: 'ok'; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50 ${
        tone === 'ok' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-300 border-zinc-700 hover:border-zinc-500'}`}>
      {busy && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  )
}
