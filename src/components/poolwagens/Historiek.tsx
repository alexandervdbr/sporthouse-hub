'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ErrorLine, PoolNav, inputCls, km, labelCls, secondaryCls, send } from './ui'
import type { PoolwagenAccess } from '@/lib/poolwagens/access'
import { formatShort } from '@/lib/poolwagens/time'
import { isOpenTrip } from '@/lib/poolwagens/trips'
import type { PoolCar, PoolOptions, PoolReservation } from '@/lib/poolwagens/types'

// De historiek: alle ritten (vertrokken reservaties), nieuwste eerst, per 50.
// Filterbaar op wagen, collega, project en periode, en op open ritten (niet
// terug terwijl de geplande terugkomst voorbij is).

interface Filters { car: string; user: string; project: string; from: string; to: string; open: boolean }
const EMPTY: Filters = { car: '', user: '', project: '', from: '', to: '', open: false }

export default function Historiek({ access }: { access: PoolwagenAccess }) {
  const [cars, setCars] = useState<PoolCar[]>([])
  const [options, setOptions] = useState<PoolOptions | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY)
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
    if (filters.project) q.set('project', filters.project)
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold text-zinc-100">Poolwagens</h1>
          <PoolNav current="historiek" manage={access.manage} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4 items-end">
          <div>
            <label className={labelCls}>Wagen</label>
            <select className={inputCls} value={filters.car} onChange={e => set('car', e.target.value)}>
              <option value="">Alle wagens</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.name}{c.archived_at ? ' (gearchiveerd)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Collega</label>
            <select className={inputCls} value={filters.user} onChange={e => set('user', e.target.value)}>
              <option value="">Iedereen</option>
              {(options?.colleagues ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Project</label>
            <select className={inputCls} value={filters.project} onChange={e => set('project', e.target.value)}>
              <option value="">Alle projecten</option>
              {(options?.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Vertrek vanaf</label>
            <input type="date" className={inputCls} value={filters.from} onChange={e => set('from', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Vertrek tot en met</label>
            <input type="date" className={inputCls} value={filters.to} onChange={e => set('to', e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pb-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={filters.open} onChange={e => set('open', e.target.checked)} /> Alleen open ritten
            </label>
            {JSON.stringify(filters) !== JSON.stringify(EMPTY) && (
              <button onClick={() => { setLoading(true); setPage(0); setFilters(EMPTY) }} className="text-xs text-zinc-500 hover:text-zinc-300">Wissen</button>
            )}
          </div>
        </div>

        <ErrorLine>{error}</ErrorLine>

        <div className="rounded-xl border border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                {['Wagen', 'Wie', 'Project', 'Vertrek', 'Aankomst', 'Km vertrek', 'Km aankomst', 'Gereden'].map(h => (
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.trips.map(t => {
                const open = isOpenTrip(t, now)
                return (
                  <tr key={t.id} className="border-t border-zinc-900">
                    <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">{t.car_name}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{t.person_name}</td>
                    <td className="px-3 py-2 text-zinc-300">{t.project?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{t.departed_at ? formatShort(t.departed_at) : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.arrived_at ? <span className="text-zinc-300">{formatShort(t.arrived_at)}</span>
                        : open ? <span className="text-red-400">Open (gepland {formatShort(t.end_at)})</span>
                        : <span className="text-sky-400">Onderweg</span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-300 tabular-nums whitespace-nowrap">{km(t.departure_km)}</td>
                    <td className="px-3 py-2 text-zinc-300 tabular-nums whitespace-nowrap">{km(t.arrival_km)}</td>
                    <td className="px-3 py-2 text-zinc-100 tabular-nums whitespace-nowrap font-medium">{km(t.driven_km)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {loading && <div className="p-4"><Loader2 size={16} className="animate-spin text-zinc-600" /></div>}
          {!loading && data && data.trips.length === 0 && <p className="p-6 text-sm text-zinc-500">Geen ritten gevonden.</p>}
        </div>

        {data && data.total > data.pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-zinc-500">
            <span>{data.total} ritten · pagina {page + 1} van {pages}</span>
            <button disabled={page === 0} onClick={() => { setLoading(true); setPage(p => p - 1) }} className={secondaryCls}>Vorige</button>
            <button disabled={page + 1 >= pages} onClick={() => { setLoading(true); setPage(p => p + 1) }} className={secondaryCls}>Volgende</button>
          </div>
        )}
      </div>
    </div>
  )
}
