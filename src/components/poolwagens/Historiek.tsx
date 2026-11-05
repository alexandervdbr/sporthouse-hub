'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History, Loader2 } from 'lucide-react'
import {
  ACCENT, EmptyState, ErrorLine, PoolHeader, actionCls, buttonCls, filterBarCls, filterInputCls, km, labelCls, pageBody, panelCls, secondaryCls, send,
} from './ui'
import type { PoolwagenAccess } from '@/lib/poolwagens/access'
import { formatShort } from '@/lib/poolwagens/time'
import { isOpenTrip } from '@/lib/poolwagens/trips'
import type { PoolCar, PoolOptions, PoolReservation } from '@/lib/poolwagens/types'

// De historiek: alle ritten (vertrokken reservaties), nieuwste eerst, per 50.
// Filterbaar op wagen, collega, klant en periode, en op open ritten (niet
// terug terwijl de geplande terugkomst voorbij is).

interface Filters { car: string; user: string; client: string; from: string; to: string; open: boolean }
const EMPTY: Filters = { car: '', user: '', client: '', from: '', to: '', open: false }

export default function Historiek({ access }: { access: PoolwagenAccess }) {
  const [cars, setCars] = useState<PoolCar[]>([])
  const [options, setOptions] = useState<PoolOptions | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [clientDraft, setClientDraft] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ trips: (PoolReservation & { car_name: string })[]; total: number; pageSize: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Ook gearchiveerde wagens horen in de historiek, maar die lijst is voor
    // beheer; gewone gebruikers zien de actieve wagens als filter.
    send<PoolCar[]>(`/api/poolwagens/cars${access.manage ? '?archived=1' : ''}`, 'GET').then(setCars).catch(() => {})
    send<PoolOptions>('/api/poolwagens/options', 'GET').then(setOptions).catch(() => {})
  }, [access.manage])

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (filters.car) q.set('car', filters.car)
    if (filters.user) q.set('user', filters.user)
    if (filters.client.trim()) q.set('klant', filters.client.trim())
    if (filters.from) q.set('from', filters.from)
    if (filters.to) q.set('to', filters.to)
    if (filters.open) q.set('open', '1')
    q.set('page', String(page))
    return q.toString()
  }, [filters, page])

  useEffect(() => {
    let alive = true
    send<{ trips: (PoolReservation & { car_name: string })[]; total: number; pageSize: number }>(`/api/poolwagens/history?${query}`, 'GET')
      .then(d => { if (alive) { setData(d); setError('') } })
      .catch(e => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query])

  const set = (k: keyof Filters, v: string | boolean) => { setLoading(true); setPage(0); setFilters(f => ({ ...f, [k]: v })) }
  const now = new Date()
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY)
  const clear = () => { setLoading(true); setPage(0); setFilters(EMPTY); setClientDraft('') }

  return (
    <div className="min-h-full pb-8">
      <PoolHeader current="historiek" manage={access.manage} loading={loading} />

      <div className={pageBody}>
        {/* Filters: op een gsm onder elkaar; op desktop een compacte rij. */}
        <section aria-label="Filters" className={filterBarCls}>
          <div>
            <label className={labelCls}>Wagen</label>
            <select className={filterInputCls} value={filters.car} onChange={e => set('car', e.target.value)}>
              <option value="">Alle wagens</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived_at ? ' (gearchiveerd)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Collega</label>
            <select className={filterInputCls} value={filters.user} onChange={e => set('user', e.target.value)}>
              <option value="">Iedereen</option>
              {(options?.colleagues ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Klant</label>
            {/* Zoekt pas bij Enter of als je het veld verlaat: geen verzoek per toets. */}
            <input className={filterInputCls} list="historiek-klanten" value={clientDraft} placeholder="Alle klanten" autoComplete="off"
              onChange={e => setClientDraft(e.target.value)}
              onBlur={() => { if (clientDraft !== filters.client) set('client', clientDraft) }}
              onKeyDown={e => { if (e.key === 'Enter' && clientDraft !== filters.client) set('client', clientDraft) }} />
            <datalist id="historiek-klanten">
              {(options?.clients ?? []).map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>Vertrek vanaf</label>
            <input type="date" className={filterInputCls} value={filters.from} onChange={e => set('from', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Vertrek tot en met</label>
            <input type="date" className={filterInputCls} value={filters.to} onChange={e => set('to', e.target.value)} />
          </div>
          <div className="flex items-center justify-between md:justify-start gap-3 min-h-11 md:min-h-0 md:pb-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={filters.open} onChange={e => set('open', e.target.checked)} /> Alleen open ritten
            </label>
            {filtered && <button onClick={clear} className="text-xs text-zinc-500 hover:text-zinc-300 py-2">Wissen</button>}
          </div>
        </section>

        <ErrorLine>{error}</ErrorLine>

        {!data ? (
          loading && <Loader2 size={18} className="animate-spin text-zinc-600" />
        ) : data.trips.length === 0 ? (
          <EmptyState icon={<History size={18} />} title="Geen ritten gevonden"
            text={filtered ? 'Er zijn geen ritten die bij deze filters passen.' : 'Zodra iemand met een poolwagen vertrekt, staat de rit hier.'}
            action={filtered
              ? <button onClick={clear} className={`${secondaryCls} ${actionCls}`}>Filters wissen</button>
              : <Link href="/poolwagens" className={`${buttonCls} ${actionCls} text-white`} style={{ backgroundColor: ACCENT }}>Naar de planning</Link>} />
        ) : (
          <>
            {/* Desktop: een tabel. */}
            <div className={`hidden md:block ${panelCls} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    {['Wagen', 'Wie', 'Klant', 'Vertrek', 'Aankomst', 'Km vertrek', 'Km aankomst', 'Gereden'].map(h => (
                      <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map(t => (
                    <tr key={t.id} className="border-t border-zinc-900">
                      <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">{t.car_name}</td>
                      <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{t.person_name}</td>
                      <td className="px-3 py-2 text-zinc-300">{t.client_name ?? '—'}</td>
                      <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{t.departed_at ? formatShort(t.departed_at) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><Arrival trip={t} now={now} /></td>
                      <td className="px-3 py-2 text-zinc-300 tabular-nums whitespace-nowrap">{km(t.departure_km)}</td>
                      <td className="px-3 py-2 text-zinc-300 tabular-nums whitespace-nowrap">{km(t.arrival_km)}</td>
                      <td className="px-3 py-2 text-zinc-100 tabular-nums whitespace-nowrap font-medium">{km(t.driven_km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gsm: kaarten. */}
            <ul className="md:hidden space-y-2">
              {data.trips.map(t => (
                <li key={t.id} className={`${panelCls} p-3 space-y-1`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100 truncate">{t.car_name}</span>
                    <span className="text-xs text-zinc-400 flex-shrink-0">{t.departed_at ? formatShort(t.departed_at) : '—'}</span>
                  </div>
                  <div className="text-sm text-zinc-300 truncate">{t.person_name}{t.client_name ? ` · ${t.client_name}` : ''}</div>
                  <div className="text-xs text-zinc-400 tabular-nums">
                    {km(t.departure_km)} → {t.arrival_km !== null ? km(t.arrival_km) : '…'}
                    {t.driven_km !== null && <span className="text-zinc-100 font-medium"> = {km(t.driven_km)}</span>}
                  </div>
                  <div className="text-xs"><Arrival trip={t} now={now} prefix /></div>
                </li>
              ))}
            </ul>
          </>
        )}

        {data && data.total > data.pageSize && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2 text-xs text-zinc-500">
            <span className="text-center md:text-left">{data.total} ritten · pagina {page + 1} van {pages}</span>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <button disabled={page === 0} onClick={() => { setLoading(true); setPage(p => p - 1) }} className={`${secondaryCls} ${actionCls}`}>Vorige</button>
              <button disabled={page + 1 >= pages} onClick={() => { setLoading(true); setPage(p => p + 1) }} className={`${secondaryCls} ${actionCls}`}>Volgende</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Aankomst, of de toestand van een rit die nog niet terug is. */
function Arrival({ trip: t, now, prefix }: { trip: PoolReservation; now: Date; prefix?: boolean }) {
  if (t.arrived_at) return <span className="text-zinc-300">{prefix ? 'Terug ' : ''}{formatShort(t.arrived_at)}</span>
  if (isOpenTrip(t, now)) return <span className="text-red-400">Open (gepland {formatShort(t.end_at)})</span>
  return <span className="text-sky-400">Onderweg</span>
}
