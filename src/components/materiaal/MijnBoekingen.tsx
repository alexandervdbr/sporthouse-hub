'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Combine, Loader2, Plus, Search, X } from 'lucide-react'
import { KeepChoice, mergeUndoEntry } from '@/components/materiaal/MergeParts'
import { Button, ErrorLine, IconButton, RowMenu, Segmented, Select, inputCls, send } from '@/components/materiaal/ui'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import { addDays } from '@/lib/gear/dates'
import { selectionFromBooking, selectionResponsibles } from '@/lib/gear/kits'
import { combinedNote, holderOf, keepOptions, mergeCheck } from '@/lib/gear/merge'
import {
  FILTER_GROUPS, GROUP_HEADING, bookingWhat, groupByPerson, groupMyBookings, matchesSearch, materialShort, nowInBrussels,
  samePeriodClusters, shortPeriod, type MyFilter, type MyGroup,
} from '@/lib/gear/my-bookings'
import { discussWith } from '@/lib/gear/responsible'
import type { GearBooking, GearCatalog } from '@/lib/gear/types'
import type { UndoEntry } from '@/lib/gear/undo'

// "Mijn boekingen" en, met Beheren, "Alle boekingen": een compacte lijst, één
// rij per boeking. Bovenaan Lopend · Gepland · Afgelopen (standaard lopend en
// gepland samen). Een rij aanklikken opent de boeking; wijzigen en annuleren
// zitten in het ⋯-menu. "Selecteren" toont de vinkjes, met onderaan
// Samenvoegen en Annuleren. In Alle boekingen per persoon gegroepeerd, met
// een hint als iemand boekingen met exact dezelfde periode heeft.
//
// Eén keer laden bij openen (en na een wijziging); geen timer.

const SCOPE = [{ value: 'mine', label: 'Mijn boekingen' }, { value: 'all', label: 'Alle boekingen' }] as const
const FILTERS: { value: MyFilter; label: string }[] = [
  { value: 'lopend', label: 'Lopend' }, { value: 'gepland', label: 'Gepland' }, { value: 'afgelopen', label: 'Afgelopen' },
]
const EMPTY: Record<MyFilter, string> = {
  komend: 'Geen lopende of geplande boekingen.',
  lopend: 'Geen lopende boekingen.',
  gepland: 'Geen geplande boekingen.',
  afgelopen: 'Geen afgelopen boekingen in deze periode.',
}

/** Kolommen vanaf sm: periode · materiaal · (voor wie) · klant/project; het ⋯-menu staat ernaast. */
const COLS = {
  mine: 'sm:grid-cols-[13rem_minmax(0,1fr)_minmax(0,12rem)]',
  all: 'sm:grid-cols-[13rem_minmax(0,1fr)_minmax(0,9rem)_minmax(0,11rem)]',
}

export default function MijnBoekingen({ userId, access, catalog, today, reloadKey, onOpen, onBook, onCancelled, announce }: {
  userId: string
  access: GearAccess
  catalog: GearCatalog
  today: string
  /** Verandert na opslaan in het formulier: opnieuw laden. */
  reloadKey: number
  onOpen: (booking: GearBooking, edit: boolean) => void
  onBook: () => void
  onCancelled: () => void
  announce: (entry: UndoEntry, message: string, undoneMessage: string) => void
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [filter, setFilter] = useState<MyFilter>('komend')
  const [since, setSince] = useState(() => addDays(today, -30))
  const [data, setData] = useState<{ key: string; bookings: GearBooking[]; truncated: boolean; has_older: boolean } | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [person, setPerson] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState<{ keep: string } | null>(null)
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [localReload, setLocalReload] = useState(0)
  const reload = useCallback(() => setLocalReload(n => n + 1), [])

  const key = `${scope}|${since}|${reloadKey}|${localReload}`
  useEffect(() => {
    let alive = true
    send<{ bookings: GearBooking[]; truncated: boolean; has_older: boolean }>(`/api/materiaal/bookings/mine?since=${since}${scope === 'all' ? '&all=1' : ''}`, 'GET')
      .then(r => { if (alive) { setData({ key, ...r }); setError('') } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Laden mislukt.') })
    return () => { alive = false }
  }, [key, since, scope])
  const loading = data?.key !== key
  const all = scope === 'all'

  const bookings = useMemo(() => data?.bookings ?? [], [data])
  const what = useMemo(() => new Map(bookings.map(b => [b.id, bookingWhat(b, catalog)])), [bookings, catalog])
  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of bookings) { const h = holderOf(b); m.set(h.key, h.label) }
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [bookings])
  const filtered = useMemo(() => bookings.filter(b =>
    (!all || !person || holderOf(b).key === person) && (!all || matchesSearch(b, search, what.get(b.id) ?? []))), [bookings, all, person, search, what])
  const groups = useMemo(() => groupMyBookings(filtered, nowInBrussels()), [filtered])
  const visibleGroups: MyGroup[] = FILTER_GROUPS[filter]
  const visible = useMemo(() => visibleGroups.flatMap(g => groups[g]), [visibleGroups, groups])

  const kits = useMemo(() => new Map(catalog.kits.map(k => [k.id, k])), [catalog.kits])
  const responsibleOf = useCallback((b: GearBooking) => {
    const sel = selectionFromBooking(b, kits)
    return [...new Set(selectionResponsibles(sel.looseItemIds, sel.kitIds, sel.excluded, catalog).map(discussWith))]
  }, [kits, catalog])

  const canChange = (b: GearBooking) => canChangeBooking(b, userId, access, today)
  const picked = bookings.filter(b => selected.has(b.id))
  const check = mergeCheck(picked)
  const options = keepOptions(picked)

  function toggle(id: string) {
    setMerging(null); setConfirmBulkCancel(false)
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function stopSelecting() { setSelecting(false); setSelected(new Set()); setMerging(null); setConfirmBulkCancel(false) }

  async function merge(keepFrom: string | null) {
    const ids = picked.map(b => b.id)
    setBusy(true); setError('')
    try {
      const r = await send<{ id: string; merge_id: string }>('/api/materiaal/bookings/merge', 'POST', { ids, keep_from: keepFrom })
      stopSelecting(); reload()
      const label = `${ids.length} boekingen samengevoegd`
      announce(mergeUndoEntry({ mergeId: r.merge_id, ids, keepFrom, label, onChange: reload }), label, 'Samenvoegen ongedaan gemaakt.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Samenvoegen mislukt.') }
    setBusy(false)
  }
  function startMerge() {
    if (!check.ok) return
    if (options.length > 1) setMerging({ keep: options[0].bookingId })
    else void merge(null)
  }
  /** De hint in Alle boekingen: selecteren met deze boekingen, en het samenvoegen klaarzetten. */
  function suggestMerge(cluster: GearBooking[]) {
    const opts = keepOptions(cluster)
    setSelecting(true); setConfirmBulkCancel(false)
    setSelected(new Set(cluster.map(b => b.id)))
    setMerging(opts.length > 1 ? { keep: opts[0].bookingId } : null)
  }

  async function cancelOne(b: GearBooking) {
    setBusy(true); setError('')
    try { await send(`/api/materiaal/bookings/${b.id}`, 'DELETE'); setCancelId(null); reload(); onCancelled() }
    catch (e) { setError(e instanceof Error ? e.message : 'Annuleren mislukt.') }
    setBusy(false)
  }
  async function cancelSelected() {
    setBusy(true); setError('')
    const failed: string[] = []
    for (const b of picked) {
      try { await send(`/api/materiaal/bookings/${b.id}`, 'DELETE') }
      catch (e) { failed.push(e instanceof Error ? e.message : 'Annuleren mislukt.') }
    }
    if (failed.length) setError(`${failed.length} van ${picked.length} niet geannuleerd: ${failed[0]}`)
    stopSelecting(); reload(); onCancelled()
    setBusy(false)
  }

  function row(b: GearBooking) {
    const editable = canChange(b)
    const resp = responsibleOf(b)
    const m = materialShort(what.get(b.id) ?? [])
    const period = shortPeriod(b, today)
    const clientProject = [b.client?.name, b.project?.name].filter(Boolean).join(' · ')
    // In Mijn boekingen staat "voor wie" niet als kolom; voor iemand anders geboekt zegt de laatste kolom het.
    const extra = !all && b.booked_for_user_id !== userId ? `voor ${holderOf(b).label}` : ''
    const muted = [clientProject, extra].filter(Boolean).join(' · ')
    const isSel = selected.has(b.id)
    const activate = () => (selecting ? editable && toggle(b.id) : onOpen(b, false))
    return (
      <li key={b.id} className={isSel ? 'bg-emerald-950/30' : 'hover:bg-zinc-800/40'}>
        <div className="flex items-center gap-2 px-2 sm:px-3">
          {selecting && (
            <input type="checkbox" className="accent-emerald-500 w-4 h-4 flex-shrink-0" checked={isSel} disabled={!editable}
              onChange={() => toggle(b.id)} aria-label={`${m.short} selecteren`}
              title={editable ? undefined : 'Deze boeking kan je niet meer wijzigen'} />
          )}
          <button type="button" onClick={activate}
            className={`flex-1 min-w-0 py-2 text-left sm:grid sm:items-center sm:gap-3 ${all ? COLS.all : COLS.mine}`}>
            {/* Telefoon: regel 1 periode + materiaal, regel 2 persoon/klant. Groter: kolommen. */}
            <span className="flex items-baseline gap-2 min-w-0 sm:contents">
              <span className="text-sm text-zinc-200 tabular-nums whitespace-nowrap">{period}</span>
              <span className="min-w-0 truncate text-sm text-zinc-100 sm:flex sm:items-center sm:gap-1.5" title={m.full}>
                <span className="truncate">{m.short}</span>
                {resp.length > 0 && (
                  <span title={`Verantwoordelijke: ${resp.join(', ')}`} className="hidden sm:inline-flex text-amber-400 flex-shrink-0">
                    <AlertTriangle size={11} aria-label={`Verantwoordelijke: ${resp.join(', ')}`} />
                  </span>
                )}
              </span>
            </span>
            <span className="flex items-center gap-2 min-w-0 text-xs text-zinc-500 sm:contents">
              {all && <span className="truncate text-zinc-300 sm:text-sm">{holderOf(b).label}</span>}
              <span className="truncate sm:text-xs">{muted}</span>
              {resp.length > 0 && <span className="sm:hidden text-amber-400 inline-flex items-center gap-1 flex-shrink-0"><AlertTriangle size={10} />{resp[0]}</span>}
            </span>
          </button>
          <RowMenu label={`Acties voor ${m.short}`} items={editable && !selecting ? [
            { label: 'Wijzigen', onClick: () => onOpen(b, true) },
            { label: 'Annuleren', onClick: () => setCancelId(b.id), danger: true },
          ] : []} />
        </div>
        {cancelId === b.id && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            <span className="text-xs text-zinc-300">Deze boeking annuleren?</span>
            <Button size="sm" variant="destructive" onClick={() => cancelOne(b)} busy={busy}>Ja, annuleren</Button>
            <Button size="sm" variant="text" onClick={() => setCancelId(null)}>Nee</Button>
          </div>
        )}
      </li>
    )
  }

  const list = (rows: GearBooking[]) => <ul className="divide-y divide-zinc-800/70">{rows.map(row)}</ul>

  /** Mijn boekingen: bij lopend + gepland twee kleine kopjes; lege groepen niet. */
  function mineView() {
    if (filter !== 'komend') return <div className="rounded-xl border border-zinc-800 overflow-hidden">{list(visible)}</div>
    return visibleGroups.filter(g => groups[g].length).map(g => (
      <section key={g} className="space-y-1">
        <h2 className="px-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{GROUP_HEADING[g]}</h2>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">{list(groups[g])}</div>
      </section>
    ))
  }

  /** Alle boekingen: per persoon, inklapbaar, met de hint voor samenvoegen. */
  function allView() {
    return groupByPerson(visible, holderOf, filter === 'afgelopen').map(g => {
      const open = !collapsed.has(g.key)
      const cluster = filter === 'afgelopen' ? null : samePeriodClusters(g.bookings.filter(canChange))[0]
      return (
        <section key={g.key} className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-zinc-900/60">
            <button type="button" aria-expanded={open} className="flex items-center gap-1.5 min-w-0 text-sm font-medium text-zinc-200"
              onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}>
              {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
              <span className="truncate">{g.label}</span>
              <span className="text-zinc-500 font-normal whitespace-nowrap">· {g.bookings.length} {g.bookings.length === 1 ? 'boeking' : 'boekingen'}</span>
            </button>
            {cluster && (
              <span className="text-xs text-amber-300 flex items-center gap-1.5">
                {cluster.length} boekingen met dezelfde periode ·
                <button type="button" className="text-emerald-400 hover:text-emerald-300 font-medium" onClick={() => suggestMerge(cluster)}>Samenvoegen</button>
              </span>
            )}
          </div>
          {open && list([...g.bookings].sort((a, b) => filter === 'afgelopen'
            ? (b.end_date + (b.end_time ?? '')).localeCompare(a.end_date + (a.end_time ?? ''))
            : (a.start_date + (a.start_time ?? '')).localeCompare(b.start_date + (b.start_time ?? ''))))}
        </section>
      )
    })
  }

  return (
    <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-3 ${selecting ? 'pb-28' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {access.manageBookings && (
          <div className="w-full sm:w-64">
            <Segmented label="Welke boekingen" value={scope} options={[...SCOPE]} onChange={v => { setScope(v); stopSelecting(); setPerson('') }} />
          </div>
        )}
        <div className="w-full sm:w-64">
          {/* Niets gekozen = lopend en gepland samen; nog eens klikken zet dat terug. */}
          <Segmented label="Toon" value={filter} options={FILTERS} onChange={v => { setFilter(f => (f === v ? 'komend' : v)); setCancelId(null) }} />
        </div>
        {all && (
          <>
            <div className="relative flex-1 min-w-[12rem]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek persoon, klant, materiaal…" aria-label="Zoek boekingen"
                className={`${inputCls} pl-9 pr-9`} />
              {search && <span className="absolute right-0.5 top-1/2 -translate-y-1/2"><IconButton label="Zoekopdracht wissen" onClick={() => setSearch('')}><X size={12} /></IconButton></span>}
            </div>
            <Select value={person} onChange={e => setPerson(e.target.value)} aria-label="Persoon" wrapperClassName="w-full sm:w-48">
              <option value="">Iedereen</option>
              {people.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-zinc-600" />}
          {access.book && visible.length > 0 && !selecting && <Button size="sm" onClick={() => setSelecting(true)}>Selecteren</Button>}
        </div>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {!loading && visible.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-zinc-500">{EMPTY[filter]}</p>
          {access.book && filter !== 'afgelopen' && <Button variant="primary" onClick={onBook}><Plus size={14} /> Boeken</Button>}
        </div>
      ) : all ? allView() : mineView()}

      {filter === 'afgelopen' && data?.has_older && (
        <Button size="sm" variant="text" onClick={() => setSince(s => addDays(s, -60))} disabled={loading}>Meer laden</Button>
      )}
      {data?.truncated && <p className="text-xs text-zinc-500">Alleen de eerste 500 boekingen worden getoond; zoek of filter om te verfijnen.</p>}

      {selecting && (
        <div className="fixed z-40 bottom-0 inset-x-0 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 space-y-2">
            {merging && (
              <KeepChoice options={options} value={merging.keep} onChange={keep => setMerging({ keep })} note={combinedNote(picked)} />
            )}
            {confirmBulkCancel && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-zinc-200">{picked.length === 1 ? 'Deze boeking annuleren?' : `${picked.length} boekingen annuleren?`}</span>
                <Button size="sm" variant="destructive" onClick={cancelSelected} busy={busy}>Ja, annuleren</Button>
                <Button size="sm" variant="text" onClick={() => setConfirmBulkCancel(false)}>Nee</Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-200 tabular-nums">{selected.size} geselecteerd</span>
              <Button variant="primary" size="sm" onClick={() => (merging ? merge(merging.keep) : startMerge())} disabled={!check.ok || busy} busy={busy && !confirmBulkCancel}>
                <Combine size={13} /> Samenvoegen
              </Button>
              <Button variant="danger" size="sm" onClick={() => { setMerging(null); setConfirmBulkCancel(true) }} disabled={!selected.size || busy}>Annuleren</Button>
              <Button variant="text" size="sm" onClick={stopSelecting} className="ml-auto">Klaar</Button>
            </div>
            {!check.ok && selected.size > 1 && <p className="text-xs text-amber-300">{check.reason}</p>}
            {selected.size === 1 && <p className="text-xs text-zinc-500">Kies nog een boeking van dezelfde persoon met exact dezelfde periode om samen te voegen.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
