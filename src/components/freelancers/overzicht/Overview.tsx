'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Mail, MoreHorizontal, Phone, Plus, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import { Button, ErrorLine, inputCls, send } from '@/components/materiaal/ui'
import type { Discipline, Freelancer } from './types'
import {
  STATUSES, STATUS_LABEL, applyFilters, filtersFromParams, filtersToParams, mailHref, nextSort, rateText,
  ratingText, sortFreelancers, telHref, type ListFilters, type SortKey,
} from './logic'
import { useUrlState } from './useUrlState'
import { Chip, MultiSelect, Sheet, Toggle, useToast } from './ui'
import { ContactIcons, PortfolioIcon } from './Contact'
import Panel from './Panel'
import Import from './Import'
import { exportCsv } from '@/features/freelancers/lib/spreadsheet'

// /freelancers: één pagina, zoals de spreadsheet maar beter.
// Eén verzoek voor de lijst en één voor de disciplines; zoeken, filteren en
// sorteren gebeuren in de browser. Geen timers, geen verzoek per rij.

export default function Overview({ canManage, clients }: { canManage: boolean; clients: string[] }) {
  const { params, set } = useUrlState()
  const fl = useMemo(() => filtersFromParams(params), [params])
  const openId = params.get('id')
  const [list, setList] = useState<Freelancer[] | null>(null)
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [loadError, setLoadError] = useState('')
  const [sheet, setSheet] = useState(false)
  const [importing, setImporting] = useState(false)
  const [more, setMore] = useState(false)
  const [reload, setReload] = useState(0)
  const toast = useToast()

  // Gearchiveerden komen alleen mee als de filter aan staat.
  useEffect(() => {
    let live = true
    send<Freelancer[]>(`/api/freelancers${fl.archief ? '?archief=1' : ''}`, 'GET')
      .then(d => { if (live) { setList(d); setLoadError('') } })
      .catch(e => { if (live) setLoadError(e instanceof Error ? e.message : 'Kon de freelancers niet ophalen.') })
    return () => { live = false }
  }, [fl.archief, reload])
  useEffect(() => {
    send<Discipline[]>('/api/freelancers/disciplines', 'GET').then(setDisciplines).catch(() => {})
  }, [reload])

  const labels = useMemo(() => Object.fromEntries(disciplines.map(d => [d.key, d.label])), [disciplines])
  const rows = useMemo(() => sortFreelancers(applyFilters(list ?? [], fl, labels), fl.sort, fl.dir, labels), [list, fl, labels])
  const setFilters = useCallback((patch: Partial<ListFilters>) => set(filtersToParams({ ...fl, ...patch })), [fl, set])
  const filterCount = fl.wat.length + fl.statuses.length + (fl.archief ? 1 : 0)
  const changed = !!fl.q || filterCount > 0

  const open = (id: string | null) => set({ id }, id ? 'push' : 'replace')
  const upsert = (f: Freelancer) => setList(l => {
    if (!l) return [f]
    return l.some(x => x.id === f.id) ? l.map(x => (x.id === f.id ? f : x)) : [...l, f]
  })
  const removeRow = (id: string) => setList(l => (l ?? []).filter(x => x.id !== id))

  const watOptions = disciplines.map(d => ({ key: d.key, label: d.label, count: (list ?? []).filter(f => f.disciplines.includes(d.key) && !f.archived_at).length }))
  const statusOptions = STATUSES.map(s => ({ key: s, label: STATUS_LABEL[s], count: (list ?? []).filter(f => f.status === s && !f.archived_at).length }))
  // Exporteren: precies wat je nu ziet (gefilterd en gesorteerd), in de kolommen van de spreadsheet.
  function download() {
    setMore(false)
    const blob = new Blob([exportCsv(rows, labels)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `freelancers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.say(`${rows.length} ${rows.length === 1 ? 'freelancer' : 'freelancers'} geëxporteerd`)
  }

  const current = openId && openId !== 'nieuw' ? list?.find(f => f.id === openId) ?? null : null

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-white">Freelancers</h1>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              {canManage && <Button onClick={() => setImporting(true)}><Upload size={14} /> Importeren</Button>}
              <Button onClick={download} disabled={!list}><Download size={14} /> Exporteren</Button>
            </div>
            <div className="relative md:hidden">
              <button type="button" onClick={() => setMore(m => !m)} aria-label="Meer" aria-expanded={more}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300"><MoreHorizontal size={18} /></button>
              {more && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
                  {canManage && <button type="button" role="menuitem" onClick={() => { setMore(false); setImporting(true) }} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-200 hover:bg-zinc-800"><Upload size={15} /> Importeren</button>}
                  <button type="button" role="menuitem" onClick={download} disabled={!list} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><Download size={15} /> Exporteren</button>
                </div>
              )}
            </div>
            {canManage && (
              <Button variant="primary" className="max-md:!h-11 max-md:!w-11 max-md:!px-0" onClick={() => open('nieuw')} aria-label="Freelancer toevoegen">
                <Plus size={16} /><span className="max-md:sr-only">Freelancer</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full md:basis-80 md:flex-none md:w-96">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input value={fl.q} onChange={e => setFilters({ q: e.target.value })} placeholder="Zoek op naam, wat of notities" aria-label="Zoeken"
              className={`${inputCls} !h-11 !pl-9 !pr-10 !text-base md:!h-9 md:!text-sm`} />
            {fl.q && <button type="button" onClick={() => setFilters({ q: '' })} aria-label="Zoekterm wissen" className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-zinc-500 hover:text-zinc-200"><X size={16} /></button>}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <MultiSelect label="Wat" options={watOptions} value={fl.wat} onChange={wat => setFilters({ wat })} />
            <MultiSelect label="Status" options={statusOptions} value={fl.statuses} onChange={v => setFilters({ statuses: v as ListFilters['statuses'] })}
              footer={<Toggle on={fl.archief} onChange={archief => setFilters({ archief })}>Gearchiveerd tonen</Toggle>} />
            {changed && <button type="button" onClick={() => set({ q: null, wat: null, status: null, archief: null })} className="h-9 px-2 text-sm text-zinc-400 hover:text-zinc-200">Wissen</button>}
          </div>
          <button type="button" onClick={() => setSheet(true)}
            className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm md:hidden ${filterCount ? 'border-[#3A913F] bg-[#3A913F]/15 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-200'}`}>
            <SlidersHorizontal size={15} /> Filters{filterCount ? ` · ${filterCount}` : ''}
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-zinc-500 md:hidden">Sorteren
            <select value={`${fl.sort}:${fl.dir}`} onChange={e => { const [sort, dir] = e.target.value.split(':'); setFilters({ sort: sort as SortKey, dir: dir as ListFilters['dir'] }) }}
              className={`${inputCls} !h-11 !w-auto !text-base`}>
              <option value="naam:asc">Naam</option><option value="beoordeling:desc">Beoordeling</option>
              <option value="status:asc">Status</option><option value="tarief:asc">Tarief</option><option value="wat:asc">Wat</option>
            </select>
          </label>
          <span className="hidden text-sm text-zinc-500 md:ml-auto md:inline">{list ? `${rows.length} ${rows.length === 1 ? 'freelancer' : 'freelancers'}` : ''}</span>
        </div>

        {loadError && <ErrorLine>{loadError}</ErrorLine>}
        {!list && !loadError && <p className="py-10 text-center text-sm text-zinc-500">Laden…</p>}
        {list && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-400">
            {list.length === 0 && !fl.archief ? 'Nog geen freelancers.' : 'Niemand gevonden.'}{' '}
            {changed && <button type="button" onClick={() => set({ q: null, wat: null, status: null, archief: null })} className="text-[#5fbf64] hover:underline">Filters wissen</button>}
          </div>
        )}

        {list && rows.length > 0 && (<>
          <Table rows={rows} fl={fl} labels={labels} onSort={k => setFilters(nextSort(fl, k))} onOpen={open} onCopied={toast.say} />
          <ul className="space-y-2 md:hidden">
            {rows.map(f => <Card key={f.id} f={f} labels={labels} onOpen={() => open(f.id)} />)}
          </ul>
        </>)}
      </div>

      {sheet && (
        <Sheet title="Filters" onClose={() => setSheet(false)}
          footer={<><Button onClick={() => set({ wat: null, status: null, archief: null })}>Wissen</Button><Button variant="primary" onClick={() => setSheet(false)}>Toon {rows.length}</Button></>}>
          <div><p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Wat</p>
            <div className="flex flex-wrap gap-1.5">{watOptions.map(o => <Chip key={o.key} active={fl.wat.includes(o.key)} onClick={() => setFilters({ wat: fl.wat.includes(o.key) ? fl.wat.filter(x => x !== o.key) : [...fl.wat, o.key] })}>{o.label}</Chip>)}</div></div>
          <div><p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</p>
            <div className="flex flex-wrap gap-1.5">{STATUSES.map(s => <Chip key={s} active={fl.statuses.includes(s)} onClick={() => setFilters({ statuses: fl.statuses.includes(s) ? fl.statuses.filter(x => x !== s) : [...fl.statuses, s] })}>{STATUS_LABEL[s]}</Chip>)}</div></div>
          <Toggle on={fl.archief} onChange={archief => setFilters({ archief })}>Gearchiveerd tonen</Toggle>
        </Sheet>
      )}

      {openId && (openId === 'nieuw' ? canManage : !!current) && (
        <Panel key={openId} freelancer={current} canManage={canManage} disciplines={disciplines} clients={clients}
          onClose={() => open(null)} onSaved={f => { upsert(f); if (openId === 'nieuw') set({ id: f.id }, 'replace') }}
          onDeleted={id => { removeRow(id); open(null) }} say={toast.say} />
      )}
      {importing && canManage && (
        <Import disciplines={disciplines} onClose={() => setImporting(false)} onDone={() => { setImporting(false); setReload(n => n + 1) }} />
      )}
      {toast.node}
    </div>
  )
}

function Head({ k, fl, onSort, children, className = '' }: { k?: SortKey; fl: ListFilters; onSort: (k: SortKey) => void; children: string; className?: string }) {
  if (!k) return <th className={`py-2 pr-3 font-medium uppercase tracking-wider ${className}`}>{children}</th>
  const on = fl.sort === k
  return (
    <th className={`py-2 pr-3 font-medium ${className}`} aria-sort={on ? (fl.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-zinc-200 ${on ? 'text-zinc-200' : ''}`}>
        {children}{on && (fl.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  )
}

function Table({ rows, fl, labels, onSort, onOpen, onCopied }: {
  rows: Freelancer[]; fl: ListFilters; labels: Record<string, string>; onSort: (k: SortKey) => void; onOpen: (id: string) => void; onCopied: (s: string) => void
}) {
  return (
    <table className="hidden w-full table-fixed text-left text-sm md:table">
      <thead className="text-[11px] text-zinc-500">
        <tr className="border-b border-zinc-800">
          <Head k="naam" fl={fl} onSort={onSort} className="w-[20%]">Naam</Head>
          <Head k="wat" fl={fl} onSort={onSort} className="w-[19%]">Wat</Head>
          <Head k="status" fl={fl} onSort={onSort} className="w-[12%]">Status</Head>
          <Head k="beoordeling" fl={fl} onSort={onSort} className="w-[17%]">Beoordeling</Head>
          <Head k="tarief" fl={fl} onSort={onSort} className="w-[14%]">Tarief</Head>
          <Head fl={fl} onSort={onSort} className="w-[11%]">Contact</Head>
          <Head fl={fl} onSort={onSort} className="w-[7%]">Portfolio</Head>
        </tr>
      </thead>
      <tbody>
        {rows.map(f => {
          const rate = rateText(f)
          const rating = ratingText(f)
          return (
            <tr key={f.id} tabIndex={0} onClick={() => onOpen(f.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(f.id) }}
              className="cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/60 focus:outline-none focus-visible:bg-zinc-900">
              <td className="py-2 pr-3"><span className="block truncate font-medium text-zinc-100">{f.name}</span>
                {f.archived_at && <span className="text-xs text-zinc-500">Gearchiveerd</span>}</td>
              <td className="truncate py-2 pr-3 text-zinc-300" title={f.disciplines.map(d => labels[d] ?? d).join(', ')}>{f.disciplines.map(d => labels[d] ?? d).join(' · ') || '—'}</td>
              <td className="py-2 pr-3 text-zinc-300">{STATUS_LABEL[f.status]}</td>
              <td className="truncate py-2 pr-3 text-zinc-300" title={f.overall_rating_note ?? undefined}>{rating ?? <span className="text-zinc-600">—</span>}</td>
              <td className="truncate py-2 pr-3 text-zinc-300" title={f.rate_note ?? undefined}>{rate ?? <span className="text-zinc-600">—</span>}</td>
              <td className="py-1 pr-3"><ContactIcons f={f} onCopied={onCopied} /></td>
              <td className="py-1 pr-3"><PortfolioIcon f={f} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Card({ f, labels, onOpen }: { f: Freelancer; labels: Record<string, string>; onOpen: () => void }) {
  const rating = ratingText(f)
  const btn = 'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 text-sm text-zinc-200 active:bg-zinc-800'
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <button type="button" onClick={onOpen} className="block w-full p-3.5 pb-2 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-zinc-100">{f.name}</span>
          {f.overall_rating != null && <span className="flex-shrink-0 text-sm text-zinc-200">★ {f.overall_rating}</span>}
        </span>
        <span className="block truncate text-xs text-zinc-400">
          {f.disciplines.map(d => labels[d] ?? d).join(' · ') || '—'} — {STATUS_LABEL[f.status]}{f.archived_at ? ' · gearchiveerd' : ''}
        </span>
        {rating && f.collab.avg != null && <span className="block truncate text-xs text-zinc-500">{rating}</span>}
      </button>
      {(f.phone || f.email) && (
        <div className="flex gap-2 px-3.5 pb-3.5">
          {f.phone && <a href={telHref(f.phone)} className={btn}><Phone size={15} /> Bellen</a>}
          {f.email && <a href={mailHref(f.email)} className={btn}><Mail size={15} /> Mailen</a>}
        </div>
      )}
    </li>
  )
}
