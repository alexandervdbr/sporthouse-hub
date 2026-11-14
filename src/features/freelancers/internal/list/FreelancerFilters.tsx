'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { inputCls } from '@/components/materiaal/ui'
import { BottomSheet, Chip } from '../ui'
import { FREELANCER_STATUS } from '../format'
import type { Discipline, Freelancer } from '../types'
import { DEFAULT_STATUSES, type ListFilters } from './filter'

// Zoeken, status (tabs met aantallen), disciplines (chips) en "Nu
// beschikbaar". Op de gsm zitten status, disciplines en beschikbaarheid in
// een bottom sheet; het zoekveld blijft altijd zichtbaar.

const STATUS_TABS: { key: Freelancer['status'] | 'alle'; label: string }[] = [
  { key: 'vast', label: FREELANCER_STATUS.vast }, { key: 'proefopdracht', label: FREELANCER_STATUS.proefopdracht },
  { key: 'kandidaat', label: FREELANCER_STATUS.kandidaat }, { key: 'inactief', label: FREELANCER_STATUS.inactief },
  { key: 'alle', label: 'Alle' },
]

type Counts = Record<Freelancer['status'] | 'alle', number>

export default function FreelancerFilters({ filters, counts, disciplines, onChange }: {
  filters: ListFilters; counts: Counts; disciplines: Discipline[]
  onChange: (patch: Record<string, string | null>) => void
}) {
  const [sheet, setSheet] = useState(false)
  const statusOn = (k: Freelancer['status'] | 'alle') => filters.statuses === 'alle' ? k === 'alle' : k !== 'alle' && filters.statuses.includes(k)

  function toggleStatus(k: Freelancer['status'] | 'alle') {
    if (k === 'alle') return onChange({ status: 'alle' })
    const current = filters.statuses === 'alle' ? [] : filters.statuses
    const next = current.includes(k) ? current.filter(s => s !== k) : [...current, k]
    const isDefault = next.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every(s => next.includes(s))
    onChange({ status: next.length === 0 || isDefault ? null : next.join(',') })
  }
  function toggleDiscipline(key: string) {
    const next = filters.disciplines.includes(key) ? filters.disciplines.filter(d => d !== key) : [...filters.disciplines, key]
    onChange({ d: next.length ? next.join(',') : null })
  }
  const activeExtra = filters.disciplines.length + (filters.nowAvailable ? 1 : 0)

  const statusTabs = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
      {STATUS_TABS.map(t => <Chip key={t.key} active={statusOn(t.key)} onClick={() => toggleStatus(t.key)}>{t.label} <span className="ml-1 text-zinc-500">{counts[t.key]}</span></Chip>)}
    </div>
  )
  const extra = (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Disciplines">
        {disciplines.map(d => <Chip key={d.key} active={filters.disciplines.includes(d.key)} onClick={() => toggleDiscipline(d.key)}>{d.label}</Chip>)}
      </div>
      <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={filters.nowAvailable} onChange={e => onChange({ nu: e.target.checked ? '1' : null })}
          className="h-4 w-4 accent-[#3A913F]" />
        Nu beschikbaar
      </label>
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input type="search" value={filters.q} onChange={e => onChange({ q: e.target.value || null })}
            placeholder="Zoek op naam, discipline of notities" aria-label="Zoeken" className={`${inputCls} !h-11 pl-9 md:!h-9`} />
        </div>
        <button type="button" onClick={() => setSheet(true)} aria-label="Filters"
          className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 md:hidden">
          <SlidersHorizontal size={16} aria-hidden />{activeExtra > 0 && <span className="text-xs">{activeExtra}</span>}
        </button>
      </div>
      <div className="hidden space-y-3 md:block">{statusTabs}{extra}</div>
      <div className="md:hidden">{statusTabs}</div>
      {sheet && <BottomSheet title="Filters" onClose={() => setSheet(false)}><div className="space-y-4 pb-2">{extra}</div></BottomSheet>}
    </div>
  )
}
