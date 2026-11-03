'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Loader2, UserRound, Wrench } from 'lucide-react'
import { ErrorLine, StatusBadge, inputCls, send } from '@/components/materiaal/ui'
import { homeNotice, barLabel } from '@/lib/gear/labels'
import { STATUS_LABEL, type UnitStatus } from '@/lib/gear/status'
import type { GearCatalog, GearUnitHistory } from '@/lib/gear/types'
import type { GearAccess } from '@/lib/gear/access'

// Eén stuk materiaal: wat het is, wat erin zit, of het in orde is, en wat
// ermee gebeurd is. Defect of beperkt melden kan iedereen die mag boeken;
// herstellen en uit dienst nemen alleen wie het materiaal beheert.

function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateTime(iso: string) {
  return new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function UnitDetail({ unitId, access }: { unitId: string; access: GearAccess }) {
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [history, setHistory] = useState<GearUnitHistory | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<UnitStatus | null>(null)

  const loadHistory = useCallback(() => {
    send<GearUnitHistory>(`/api/materiaal/units/${unitId}/history`, 'GET').then(setHistory).catch(e => setError(e.message))
  }, [unitId])

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
    loadHistory()
  }, [loadHistory])

  const unit = catalog?.units.find(u => u.id === unitId)
  const category = catalog?.categories.find(c => c.id === unit?.category_id)
  const holder = catalog?.holders.find(h => h.id === unit?.home_client_id)

  // Boekingen en statuswijzigingen door elkaar, nieuwste eerst.
  const timeline = useMemo(() => {
    if (!history) return []
    return [
      ...history.bookings.map(b => ({ kind: 'booking' as const, at: b.start_date, b })),
      ...history.status.map(s => ({ kind: 'status' as const, at: s.changed_at, s })),
    ].sort((x, y) => y.at.localeCompare(x.at))
  }, [history])

  async function setStatus(status: UnitStatus) {
    if ((status === 'defect' || status === 'beperkt') && !note.trim()) {
      setError('Schrijf kort wat er mis is.')
      return
    }
    setBusy(status); setError('')
    try {
      const updated = await send<{ id: string; status: UnitStatus; status_note: string | null }>(
        `/api/materiaal/units/${unitId}/status`, 'POST', { status, note })
      setCatalog(c => c && ({ ...c, units: c.units.map(u => (u.id === unitId ? { ...u, ...updated } : u)) }))
      setNote('')
      loadHistory()
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan mislukt.') }
    setBusy(null)
  }

  if (!catalog) {
    return <div className="p-8">{error ? <ErrorLine>{error}</ErrorLine> : <Loader2 size={20} className="animate-spin text-zinc-600" />}</div>
  }
  if (!unit) {
    return <div className="p-8"><ErrorLine>Dit materiaal bestaat niet (meer).</ErrorLine></div>
  }

  const specs: [string, string | null][] = [
    ['Aantal', unit.quantity > 1 ? `${unit.quantity} stuks, samen geboekt` : null],
    ['Labelkleur', unit.label_color],
    ['ND-filter', unit.nd_size],
    ['Notities', unit.notes],
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/materiaal" className="hover:text-zinc-300">Materiaal</Link>
          <ChevronRight size={14} />
          {access.manageCatalog
            ? <Link href="/materiaal/beheer" className="hover:text-zinc-300">{category?.name}</Link>
            : <span>{category?.name}</span>}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: category?.color }}>{category?.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-zinc-100">{unit.name}</h1>
            <StatusBadge status={unit.status} />
          </div>
          {unit.status_note && unit.status !== 'ok' && <p className="mt-1 text-sm text-zinc-400">{unit.status_note}</p>}
        </div>

        {unit.warning && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
            {unit.warning}
          </div>
        )}
        {holder && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
            <UserRound size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
            {homeNotice(holder.name)}
          </div>
        )}

        {specs.some(([, v]) => v) && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            {specs.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-zinc-200 whitespace-pre-line">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {unit.contents.length > 0 && (
          <section>
            <p className="section-label mb-2">Inhoud van de kit</p>
            <ul className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80">
              {[...unit.contents].sort((a, b) => a.sort_order - b.sort_order).map(c => (
                <li key={c.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                  <span className="w-8 text-right text-zinc-500 tabular-nums">{c.quantity}×</span>
                  <span className="text-zinc-200">{c.label}</span>
                  {c.note && <span className="ml-auto text-xs text-zinc-500">{c.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {access.book && (
          <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <p className="section-label">Toestand</p>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={unit.status === 'ok' ? 'Wat is er mis? bv. lens krast' : 'Notitie (optioneel), bv. hersteld door Cameranu'}
              aria-label="Notitie bij de statuswijziging"
              className={inputCls}
            />
            {error && <ErrorLine>{error}</ErrorLine>}
            <div className="flex flex-wrap gap-2">
              {(['defect', 'beperkt'] as const).filter(s => s !== unit.status).map(s => (
                <StatusButton key={s} onClick={() => setStatus(s)} busy={busy === s}>
                  <Wrench size={12} /> {s === 'defect' ? 'Defect melden' : 'Beperkt bruikbaar melden'}
                </StatusButton>
              ))}
              {access.manageCatalog && unit.status !== 'ok' && (
                <StatusButton onClick={() => setStatus('ok')} busy={busy === 'ok'} tone="ok">Hersteld</StatusButton>
              )}
              {access.manageCatalog && unit.status !== 'uit_dienst' && (
                <StatusButton onClick={() => setStatus('uit_dienst')} busy={busy === 'uit_dienst'}>Uit dienst nemen</StatusButton>
              )}
            </div>
          </section>
        )}
        {!access.book && error && <ErrorLine>{error}</ErrorLine>}

        <section>
          <p className="section-label mb-2">Geschiedenis</p>
          {!history ? (
            <Loader2 size={16} className="animate-spin text-zinc-600" />
          ) : timeline.length === 0 ? (
            <p className="text-sm text-zinc-600">Nog niets gebeurd met dit materiaal.</p>
          ) : (
            <ol className="space-y-1.5">
              {timeline.map(item => item.kind === 'booking' ? (
                <li key={`b-${item.b.id}`} className={`flex flex-wrap items-baseline gap-x-2 text-sm ${item.b.cancelled_at ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>
                  <span className="tabular-nums text-zinc-500">{shortDate(item.b.start_date)}{item.b.end_date !== item.b.start_date && ` – ${shortDate(item.b.end_date)}`}</span>
                  <span>{barLabel({ personName: item.b.person_name, clientName: item.b.client?.name, clientColor: item.b.client?.color }).text}</span>
                  {item.b.note && <span className="text-xs text-zinc-500">· {item.b.note}</span>}
                  {item.b.cancelled_at && <span className="text-xs no-underline">(geannuleerd)</span>}
                </li>
              ) : (
                <li key={`s-${item.s.id}`} className="flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-400">
                  <span className="tabular-nums text-zinc-500">{dateTime(item.s.changed_at)}</span>
                  <span>
                    {item.s.old_status ? `${STATUS_LABEL[item.s.old_status]} → ` : ''}{STATUS_LABEL[item.s.new_status]}
                  </span>
                  <span className="text-xs text-zinc-500">door {item.s.changed_by_name}{item.s.note ? ` · ${item.s.note}` : ''}</span>
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
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50 ${
        tone === 'ok'
          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          : 'text-zinc-300 border-zinc-700 hover:border-zinc-500'
      }`}
    >
      {busy && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  )
}
