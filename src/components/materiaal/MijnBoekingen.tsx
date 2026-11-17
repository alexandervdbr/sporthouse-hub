'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Combine, Loader2, Search, X } from 'lucide-react'
import { KeepChoice, mergeUndoEntry } from '@/components/materiaal/MergeParts'
import { Button, ErrorLine, IconButton, Segmented, Select, inputCls, send } from '@/components/materiaal/ui'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import { addDays } from '@/lib/gear/dates'
import { selectionFromBooking, selectionResponsibles } from '@/lib/gear/kits'
import { combinedNote, holderOf, keepOptions, mergeCheck } from '@/lib/gear/merge'
import { MY_GROUP_LABEL, bookingWhat, groupMyBookings, matchesSearch, nowInBrussels, type MyGroup } from '@/lib/gear/my-bookings'
import { discussWith } from '@/lib/gear/responsible'
import { bookingSlot, slotLabel } from '@/lib/gear/times'
import type { GearBooking, GearCatalog } from '@/lib/gear/types'
import type { UndoEntry } from '@/lib/gear/undo'

// "Mijn boekingen": alles wat voor mij geboekt is of wat ik maakte, in drie
// groepen (nu bij mij, binnenkort, voorbij). Openen, wijzigen, annuleren, en
// boekingen van dezelfde persoon met exact dezelfde periode samenvoegen.
// Met Beheren: "Alle boekingen", met zoeken en een filter per persoon.
//
// Eén keer laden bij openen (en na een wijziging); geen timer.

const GROUPS: MyGroup[] = ['nu', 'binnenkort', 'voorbij']
const SCOPE = [{ value: 'mine', label: 'Mijn boekingen' }, { value: 'all', label: 'Alle boekingen' }] as const

export default function MijnBoekingen({ userId, access, catalog, today, reloadKey, onOpen, onCancelled, announce }: {
  userId: string
  access: GearAccess
  catalog: GearCatalog
  today: string
  /** Verandert na opslaan in het formulier: opnieuw laden. */
  reloadKey: number
  onOpen: (booking: GearBooking, edit: boolean) => void
  onCancelled: () => void
  announce: (entry: UndoEntry, message: string, undoneMessage: string) => void
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [since, setSince] = useState(() => addDays(today, -30))
  const [data, setData] = useState<{ key: string; bookings: GearBooking[]; truncated: boolean } | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [person, setPerson] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState<{ keep: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [localReload, setLocalReload] = useState(0)
  const reload = useCallback(() => setLocalReload(n => n + 1), [])

  const key = `${scope}|${since}|${reloadKey}|${localReload}`
  useEffect(() => {
    let alive = true
    send<{ bookings: GearBooking[]; truncated: boolean }>(`/api/materiaal/bookings/mine?since=${since}${scope === 'all' ? '&all=1' : ''}`, 'GET')
      .then(r => { if (alive) { setData({ key, ...r }); setError('') } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Laden mislukt.') })
    return () => { alive = false }
  }, [key, since, scope])
  const loading = data?.key !== key

  const bookings = useMemo(() => data?.bookings ?? [], [data])
  const what = useMemo(() => new Map(bookings.map(b => [b.id, bookingWhat(b, catalog)])), [bookings, catalog])
  const people = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of bookings) { const h = holderOf(b); m.set(h.key, h.label) }
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [bookings])
  const shown = useMemo(() => bookings.filter(b =>
    (!person || holderOf(b).key === person) && matchesSearch(b, search, what.get(b.id) ?? [])), [bookings, person, search, what])
  const groups = useMemo(() => groupMyBookings(shown, nowInBrussels()), [shown])

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
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function merge(keepFrom: string | null) {
    const ids = picked.map(b => b.id)
    setBusy(true); setError('')
    try {
      const r = await send<{ id: string; merge_id: string }>('/api/materiaal/bookings/merge', 'POST', { ids, keep_from: keepFrom })
      setMerging(null); setSelected(new Set()); reload()
      const label = `${ids.length} boekingen samengevoegd`
      announce(mergeUndoEntry({ mergeId: r.merge_id, ids, keepFrom, label, onChange: reload }), label, 'Samenvoegen ongedaan gemaakt.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Samenvoegen mislukt.') }
    setBusy(false)
  }

  async function cancel(b: GearBooking) {
    setBusy(true); setError('')
    try { await send(`/api/materiaal/bookings/${b.id}`, 'DELETE'); setCancelId(null); reload(); onCancelled() }
    catch (e) { setError(e instanceof Error ? e.message : 'Annuleren mislukt.') }
    setBusy(false)
  }

  function startMerge() {
    if (!check.ok) return
    if (options.length > 1) setMerging({ keep: options[0].bookingId })
    else void merge(null)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {access.manageBookings && (
          <div className="w-full sm:w-72">
            <Segmented label="Welke boekingen" value={scope} options={[...SCOPE]} onChange={v => { setScope(v); setSelected(new Set()); setPerson('') }} />
          </div>
        )}
        {scope === 'all' && (
          <>
            <div className="relative flex-1 min-w-[12rem]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek persoon, klant, materiaal…" aria-label="Zoek boekingen"
                className={`${inputCls} pl-9 pr-9`} />
              {search && <span className="absolute right-0.5 top-1/2 -translate-y-1/2"><IconButton label="Zoekopdracht wissen" onClick={() => setSearch('')}><X size={12} /></IconButton></span>}
            </div>
            <Select value={person} onChange={e => setPerson(e.target.value)} aria-label="Persoon" wrapperClassName="w-full sm:w-52">
              <option value="">Iedereen</option>
              {people.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-zinc-600" />}
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-200">{selected.size} geselecteerd</span>
            <Button variant="primary" size="sm" onClick={startMerge} disabled={!check.ok || busy} busy={busy && !merging}>
              <Combine size={13} /> Samenvoegen
            </Button>
            <Button variant="text" size="sm" onClick={() => { setSelected(new Set()); setMerging(null) }}>Wissen</Button>
          </div>
          {!check.ok && selected.size > 1 && <p className="text-xs text-amber-300">{check.reason}</p>}
          {!check.ok && selected.size === 1 && <p className="text-xs text-zinc-500">Kies nog een boeking van dezelfde persoon met exact dezelfde periode.</p>}
          {merging && (
            <div className="pt-1 space-y-2">
              <KeepChoice options={options} value={merging.keep} onChange={keep => setMerging({ keep })} note={combinedNote(picked)} />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => merge(merging.keep)} busy={busy}>Samenvoegen</Button>
                <Button variant="text" size="sm" onClick={() => setMerging(null)}>Annuleren</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && bookings.length === 0 && !error && (
        <p className="py-12 text-center text-sm text-zinc-500">
          {scope === 'all' ? 'Geen boekingen in deze periode.' : 'Je hebt geen boekingen. Boek materiaal via de knop Boeken.'}
        </p>
      )}

      {GROUPS.map(g => (groups[g].length > 0 || (g === 'voorbij' && bookings.length > 0)) && (
        <section key={g} className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {MY_GROUP_LABEL[g]}{g === 'voorbij' && <span className="normal-case tracking-normal"> · sinds {new Date(`${since}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}</span>}
          </h2>
          {groups[g].length === 0 && <p className="text-sm text-zinc-600">Niets.</p>}
          <ul className="space-y-2">
            {groups[g].map(b => {
              const editable = canChange(b)
              const resp = responsibleOf(b)
              const names = what.get(b.id) ?? []
              const forOther = b.booked_for_user_id !== userId
              return (
                <li key={b.id} className={`rounded-xl border px-3 py-2.5 ${selected.has(b.id) ? 'border-emerald-600/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 accent-emerald-500 w-4 h-4 flex-shrink-0" aria-label="Selecteren om samen te voegen"
                      checked={selected.has(b.id)} disabled={!editable} onChange={() => toggle(b.id)}
                      title={editable ? 'Selecteren om samen te voegen' : 'Deze boeking kan je niet meer wijzigen'} />
                    <button type="button" onClick={() => onOpen(b, false)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm text-zinc-100 font-medium break-words">{names.join(', ') || 'Geen materiaal'}</p>
                      <p className="text-xs text-zinc-400 tabular-nums">{slotLabel(bookingSlot(b.start_date, b.start_time, b.end_date, b.end_time))}</p>
                      <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-2">
                        {(forOther || scope === 'all') && <span>Voor {holderOf(b).label}</span>}
                        {b.client && <span className="inline-flex items-center gap-1">{b.client.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.client.color }} />}{b.client.name}</span>}
                        {b.project && <span>· {b.project.name}</span>}
                        {b.note && <span className="text-zinc-600 truncate max-w-[16rem]">· {b.note}</span>}
                      </p>
                      {resp.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle size={10} /> Verantwoordelijke: {resp.join(', ')}</p>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 pl-7 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="text" onClick={() => onOpen(b, false)}>Openen</Button>
                    {editable && <Button size="sm" variant="text" onClick={() => onOpen(b, true)}>Wijzigen</Button>}
                    {editable && cancelId !== b.id && <Button size="sm" variant="text" className="!text-red-400 hover:!text-red-300" onClick={() => setCancelId(b.id)}>Annuleren</Button>}
                    {cancelId === b.id && (
                      <>
                        <span className="text-xs text-zinc-300">Zeker?</span>
                        <Button size="sm" variant="destructive" onClick={() => cancel(b)} busy={busy}>Ja, annuleren</Button>
                        <Button size="sm" variant="text" onClick={() => setCancelId(null)}>Nee</Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {g === 'voorbij' && (
            <Button size="sm" variant="text" onClick={() => setSince(s => addDays(s, -60))} disabled={loading}>Meer tonen</Button>
          )}
        </section>
      ))}
      {data?.truncated && <p className="text-xs text-zinc-500">Alleen de eerste 500 boekingen worden getoond; zoek of filter om te verfijnen.</p>}
    </div>
  )
}
