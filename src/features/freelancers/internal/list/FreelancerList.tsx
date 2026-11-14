'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button, ErrorLine, Select } from '@/components/materiaal/ui'
import { todayInBrussels } from '@/lib/gear/dates'
import { internalApi } from '../api'
import { useUrlState } from '../useUrlState'
import { EmptyState } from '../ui'
import type { Discipline, Freelancer } from '../types'
import FreelancerFilters from './FreelancerFilters'
import { FreelancerCards, FreelancerTable } from './FreelancerTable'
import { applyFilters, filtersFromParams, sortFreelancers, statusCounts, type SortKey } from './filter'

// Tabblad Freelancers: zoeken, filteren en sorteren (alles in de URL), een
// tabel op desktop en kaarten op de gsm.
export default function FreelancerList({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  const { params, set } = useUrlState()
  const filters = filtersFromParams(params)
  const [list, setList] = useState<Freelancer[] | null>(null)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([internalApi.list(), internalApi.disciplines()])
      .then(([l, d]) => { if (alive) { setList(l); setDisciplines(d) } })
      .catch(err => { if (alive) setError((err as Error).message) })
    return () => { alive = false }
  }, [])

  const labels = useMemo(() => Object.fromEntries(disciplines.map(d => [d.key, d.label])), [disciplines])
  const visible = useMemo(() => list ? sortFreelancers(applyFilters(list, filters, labels, todayInBrussels()), filters.sort) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters volgt params
    [list, params, labels])

  if (error) return <ErrorLine>{error}</ErrorLine>
  if (!list) return <Loader2 className="mx-auto mt-10 animate-spin text-zinc-500" aria-label="Laden" />

  const filtered = filters.q || filters.disciplines.length || filters.nowAvailable || filters.statuses === 'alle'
  return (
    <div className="space-y-4">
      <FreelancerFilters filters={filters} counts={statusCounts(list)} disciplines={disciplines} onChange={set} />
      <div className="flex items-center justify-between gap-3 text-sm text-zinc-500">
        <span>{visible.length} {visible.length === 1 ? 'freelancer' : 'freelancers'}</span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Sorteren op</span>
          <Select value={filters.sort} onChange={e => set({ sort: e.target.value === 'beoordeling' ? null : e.target.value as SortKey })} wrapperClassName="w-40" aria-label="Sorteren op">
            <option value="beoordeling">Beoordeling</option>
            <option value="laatste">Laatste opdracht</option>
            <option value="tarief">Tarief</option>
          </Select>
        </label>
      </div>

      {visible.length === 0 ? (
        list.length === 0
          ? <EmptyState title="Nog geen freelancers" action={canManage ? <Button variant="primary" onClick={onAdd}>+ Freelancer</Button> : undefined}>Voeg je eerste freelancer toe.</EmptyState>
          : <EmptyState title="Niemand gevonden" action={filtered ? <Button onClick={() => set({ q: null, d: null, nu: null, status: null })}>Filters wissen</Button> : undefined}>Pas je zoekterm of filters aan.</EmptyState>
      ) : (
        <>
          <div className="hidden md:block"><FreelancerTable list={visible} labels={labels} /></div>
          <div className="md:hidden"><FreelancerCards list={visible} labels={labels} /></div>
        </>
      )}
    </div>
  )
}
