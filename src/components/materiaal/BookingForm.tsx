'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Loader2, Package, Search, UserRound, X } from 'lucide-react'
import { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import { eachDay } from '@/lib/gear/dates'
import { HOLDER_ERROR_TEXT, validateHolder } from '@/lib/gear/holder'
import { bookedLines, bookingSelection, checkKitParts, kitByItem, selectionFromBooking, type PartCheck } from '@/lib/gear/kits'
import { conflictDays, findConflicts, rangeLength, validateRange, type Conflict, type DateRange } from '@/lib/gear/ranges'
import { effectiveResponsible, responsibleLabel, responsibleName, RESPONSIBLE_NOTICE } from '@/lib/gear/responsible'
import { isBookable, STATUS_LABEL } from '@/lib/gear/status'
import type { GearBooking, GearBookingInput, GearBookingOptions, GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

// Boeken, bekijken, wijzigen en annuleren in één venster. Een kit boekt de
// onderdelen die er nu in zitten. Is een onderdeel defect, uit dienst of die
// dagen al elders weg, dan kan de kit alleen mee "zonder" dat onderdeel — en
// dat kies je zelf. De database controleert alles opnieuw bij opslaan.

type PersonKind = 'collega' | 'freelancer' | 'extern' | 'geen'

const KIND_LABEL: Record<PersonKind, string> = {
  collega: 'Collega', freelancer: 'Freelancer', extern: 'Extern', geen: 'Alleen een klant',
}

interface Props {
  catalog: GearCatalog
  options: GearBookingOptions | null
  /** De boekingen van het geladen venster, om botsingen meteen te tonen. */
  bookings: GearBooking[]
  loadedWindow: DateRange
  today: string
  userId: string
  access: GearAccess
  /** Nieuwe boeking: voorgekozen kits, items en dagen. */
  initial?: { kitIds: string[]; itemIds: string[]; start: string; end: string }
  /** Bestaande boeking openen. */
  booking?: GearBooking
  onClose: () => void
  onSaved: () => void
}

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function clashText(c: Conflict) {
  return `Al weg ${fmt(c.days.start)}${c.days.end !== c.days.start ? ` – ${fmt(c.days.end)}` : ''} · ${c.holderLabel}`
}

const PART_REASON: Record<PartCheck['state'], string> = {
  ok: '', beperkt: 'Beperkt bruikbaar', defect: 'Defect', uit_dienst: 'Uit dienst', elders: '',
}

export default function BookingForm({ catalog, options, bookings, loadedWindow, today, userId, access, initial, booking, onClose, onSaved }: Props) {
  const editable = booking ? canChangeBooking(booking, userId, access, today) : access.book
  const [editing, setEditing] = useState(!booking)

  const items = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items])
  const kits = useMemo(() => new Map(catalog.kits.map(k => [k.id, k])), [catalog.kits])
  const kitOf = useMemo(() => kitByItem(catalog.kits), [catalog.kits])
  const clients = useMemo(() => new Map(catalog.clients.map(c => [c.id, c])), [catalog.clients])
  const categories = useMemo(() => new Map(catalog.categories.map(c => [c.id, c])), [catalog.categories])

  const start0 = booking ? selectionFromBooking(booking, kits) : null
  const initialKind: PersonKind = booking
    ? booking.booked_for_user_id ? 'collega' : booking.freelancer_id ? 'freelancer' : booking.person_name ? 'extern' : 'geen'
    : 'collega'

  const [start, setStart] = useState(booking?.start_date ?? initial?.start ?? today)
  const [end, setEnd] = useState(booking?.end_date ?? initial?.end ?? today)
  const [kitIds, setKitIds] = useState<string[]>(start0?.kitIds ?? initial?.kitIds ?? [])
  const [looseIds, setLooseIds] = useState<string[]>(start0?.looseItemIds ?? initial?.itemIds ?? [])
  const [excluded, setExcluded] = useState<Set<string>>(start0?.excluded ?? new Set())
  const [kind, setKind] = useState<PersonKind>(initialKind)
  const [userIdFor, setUserIdFor] = useState(booking?.booked_for_user_id ?? (booking ? '' : userId))
  const [freelancerId, setFreelancerId] = useState(booking?.freelancer_id ?? '')
  const [external, setExternal] = useState(booking?.external_name ?? (initialKind === 'extern' ? booking?.person_name ?? '' : ''))
  const [clientId, setClientId] = useState(booking?.client?.id ?? '')
  const [projectId, setProjectId] = useState(booking?.project?.id ?? '')
  const [note, setNote] = useState(booking?.note ?? '')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const range = { start, end }
  const rangeError = validateRange(range)
  const holderInput = {
    userId: kind === 'collega' ? userIdFor : null,
    freelancerId: kind === 'freelancer' ? freelancerId : null,
    externalName: kind === 'extern' ? external : null,
    clientId,
  }
  const holderError = validateHolder(holderInput)

  const booked = useMemo(() => bookedLines(bookings), [bookings])
  const bookingId = booking?.id
  const bookingLines = booking?.lines

  // Per gekozen kit: elk onderdeel met zijn toestand op deze dagen.
  const kitChecks = useMemo(() => {
    if (validateRange({ start, end })) return new Map<string, PartCheck[]>()
    return new Map(kitIds.map(id => {
      const kit = kits.get(id)
      return [id, kit ? checkKitParts(kit, items, { start, end }, booked, bookingId) : []]
    }))
  }, [kitIds, kits, items, start, end, booked, bookingId])

  const looseChecks = useMemo(() => {
    const valid = !validateRange({ start, end })
    const already = new Set(bookingLines?.map(l => l.item_id) ?? [])
    return looseIds.map(id => {
      const item = items.get(id)
      const conflicts = valid && item ? findConflicts([id], { start, end }, booked, bookingId) : []
      const unavailable = !!item && !isBookable(item.status) && !already.has(id)
      return { id, item, conflicts, unavailable }
    })
  }, [looseIds, items, start, end, booked, bookingId, bookingLines])

  const unresolved = [...kitChecks.values()].flat().filter(p => p.blocking && !excluded.has(p.item.id))
  const looseProblems = looseChecks.filter(l => l.conflicts.length || l.unavailable)
  const includedParts = [...kitChecks.values()].flat().filter(p => !excluded.has(p.item.id))
  const includedCount = includedParts.length + looseIds.length
  const clashDays = conflictDays([...includedParts.flatMap(p => p.conflicts), ...looseChecks.flatMap(l => l.conflicts)])
  const outsideWindow = !rangeError && (start < loadedWindow.start || end > loadedWindow.end)
  const inPast = !rangeError && start < today && !access.manageBookings && start !== booking?.start_date

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { kits: [] as GearKit[], items: [] as GearItem[] }
    const catName = (id: string) => (categories.get(id)?.name ?? '').toLowerCase()
    return {
      kits: catalog.kits.filter(k => !kitIds.includes(k.id) && (k.name.toLowerCase().includes(q) || catName(k.category_id).includes(q))).slice(0, 5),
      items: catalog.items
        .filter(i => !looseIds.includes(i.id) && isBookable(i.status))
        .filter(i => !(kitOf.get(i.id) && kitIds.includes(kitOf.get(i.id)!.id) && !excluded.has(i.id)))
        .filter(i => i.name.toLowerCase().includes(q) || (i.model ?? '').toLowerCase().includes(q) || catName(i.category_id).includes(q))
        .slice(0, 8),
    }
  }, [query, catalog.kits, catalog.items, kitIds, looseIds, excluded, kitOf, categories])

  function addItem(id: string) {
    const kit = kitOf.get(id)
    // Een weggelaten onderdeel van een gekozen kit: gewoon weer meenemen.
    if (kit && kitIds.includes(kit.id)) setExcluded(prev => { const n = new Set(prev); n.delete(id); return n })
    else setLooseIds(ids => [...ids, id])
    setQuery('')
  }
  function toggleExcluded(id: string, on: boolean) {
    setExcluded(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
  }

  const projects = (options?.projects ?? []).filter(p => !clientId || !p.client_id || p.client_id === clientId)
  const canSave = editing && editable && !saving && includedCount > 0 && !rangeError && !holderError
    && unresolved.length === 0 && looseProblems.length === 0 && !inPast

  async function save() {
    setSaving(true); setError('')
    const body: GearBookingInput = {
      start_date: start, end_date: end,
      ...bookingSelection(looseIds, kitIds, excluded, kits),
      user_id: holderInput.userId, freelancer_id: holderInput.freelancerId, external_name: holderInput.externalName,
      client_id: clientId || null, project_id: projectId || null, note,
    }
    try {
      await send(booking ? `/api/materiaal/bookings/${booking.id}` : '/api/materiaal/bookings', booking ? 'PATCH' : 'POST', body)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan mislukt.') }
    setSaving(false)
  }

  async function cancelBooking() {
    if (!booking) return
    setSaving(true); setError('')
    try { await send(`/api/materiaal/bookings/${booking.id}`, 'DELETE'); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : 'Annuleren mislukt.') }
    setSaving(false)
  }

  const readOnly = !editing

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="booking-title"
        className="relative w-full max-w-xl max-h-[92dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 id="booking-title" className="text-sm font-semibold text-zinc-100">
            {booking ? (editing ? 'Boeking wijzigen' : 'Boeking') : 'Materiaal boeken'}
          </h2>
          <button onClick={onClose} aria-label="Sluiten" className="text-zinc-500 hover:text-zinc-200"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Periode */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}><Calendar size={10} className="inline mr-1" />Ophalen</span>
              <input type="date" value={start} disabled={readOnly} min={access.manageBookings ? undefined : today}
                onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}><Calendar size={10} className="inline mr-1" />Terugbrengen</span>
              <input type="date" value={end} min={start} disabled={readOnly} onChange={e => setEnd(e.target.value)} className={inputCls} />
            </label>
          </div>
          {!rangeError && (
            <div className="flex flex-wrap gap-1">
              {eachDay(start, end).slice(0, 31).map(d => (
                <span key={d} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${clashDays.has(d)
                  ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}`}>
                  {fmt(d)}
                </span>
              ))}
              <span className="text-[10px] text-zinc-500 self-center ml-1">{rangeLength(range)} {rangeLength(range) === 1 ? 'dag' : 'dagen'}</span>
            </div>
          )}

          {/* Kits */}
          {kitIds.map(id => {
            const kit = kits.get(id)
            if (!kit) return null
            const parts = kitChecks.get(id) ?? []
            const resp = responsibleName(kit, clients)
            const included = parts.filter(p => !excluded.has(p.item.id)).length
            return (
              <div key={id} className={`rounded-xl border ${parts.some(p => p.blocking && !excluded.has(p.item.id)) ? 'border-red-500/40' : 'border-zinc-800'} bg-zinc-950/40`}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/80">
                  <Package size={13} className="text-zinc-500" />
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(kit.category_id)?.color }} />
                  <span className="text-sm font-medium text-zinc-100 truncate">{kit.name}</span>
                  <span className="text-[11px] text-zinc-500 flex-shrink-0">{included} van {parts.length}</span>
                  {!readOnly && (
                    <button onClick={() => setKitIds(ids => ids.filter(k => k !== id))} aria-label={`${kit.name} weghalen`}
                      className="ml-auto text-zinc-600 hover:text-zinc-300"><X size={13} /></button>
                  )}
                </div>
                <div className="px-3 py-2 space-y-1">
                  {resp && <Notice icon="user">{RESPONSIBLE_NOTICE} {responsibleLabel({ name: resp, viaKit: null })}</Notice>}
                  {kit.warning && <Notice icon="warn">{kit.warning}</Notice>}
                  {kit.notes && <p className="text-[11px] text-zinc-500">{kit.notes}</p>}
                  <ul className="mt-1 space-y-0.5">
                    {parts.map(p => {
                      const out = excluded.has(p.item.id)
                      const own = effectiveResponsible(p.item, null, clients)
                      return (
                        <li key={p.item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <input type="checkbox" checked={!out} disabled={readOnly || (p.blocking && out)}
                            onChange={e => toggleExcluded(p.item.id, !e.target.checked)}
                            aria-label={`${p.item.name} meenemen`} className="accent-[#3A913F]" />
                          <span className={out ? 'text-zinc-600 line-through' : p.blocking ? 'text-red-300' : 'text-zinc-300'}>{p.item.name}</span>
                          {p.state === 'elders' && p.conflicts.map(c => <span key={c.bookingId} className="text-[11px] text-red-400">{clashText(c)}</span>)}
                          {(p.state === 'defect' || p.state === 'uit_dienst') && <span className="text-[11px] text-red-400">{PART_REASON[p.state]}{p.item.status_note ? `: ${p.item.status_note}` : ''}</span>}
                          {p.state === 'beperkt' && <span className="text-[11px] text-amber-300">Beperkt{p.item.status_note ? `: ${p.item.status_note}` : ''}</span>}
                          {p.item.warning && <span className="text-[11px] text-amber-300">⚠ {p.item.warning}</span>}
                          {own && <span className="text-[11px] text-amber-300">{responsibleLabel(own)}</span>}
                          {p.blocking && !out && !readOnly && (
                            <button onClick={() => toggleExcluded(p.item.id, true)}
                              className="px-1.5 py-0.5 rounded border border-red-500/40 text-[11px] text-red-300 hover:bg-red-500/10">
                              Zonder {p.item.name}
                            </button>
                          )}
                          {out && !readOnly && <span className="text-[11px] text-zinc-500">zonder</span>}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )
          })}

          {/* Losse items */}
          {looseChecks.length > 0 && (
            <div className="space-y-1.5">
              {looseChecks.map(({ id, item, conflicts, unavailable }) => {
                if (!item) return null
                const resp = effectiveResponsible(item, kitOf.get(item.id) ?? null, clients)
                return (
                  <div key={id} className={`rounded-lg border px-3 py-2 ${conflicts.length || unavailable ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800 bg-zinc-950/40'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(item.category_id)?.color }} />
                      <span className="text-sm text-zinc-100 truncate">{item.name}</span>
                      {kitOf.get(id) && <span className="text-[10px] text-zinc-500">uit {kitOf.get(id)!.name}</span>}
                      {!readOnly && (
                        <button onClick={() => setLooseIds(ids => ids.filter(x => x !== id))} aria-label={`${item.name} weghalen`}
                          className="ml-auto text-zinc-600 hover:text-zinc-300"><X size={13} /></button>
                      )}
                    </div>
                    {conflicts.map(c => <p key={c.bookingId} className="mt-1 text-[11px] text-red-400">{clashText(c)}</p>)}
                    {unavailable && <p className="mt-1 text-[11px] text-red-400">{STATUS_LABEL[item.status]}{item.status_note ? `: ${item.status_note}` : ''}</p>}
                    {item.status === 'beperkt' && <p className="mt-1 text-[11px] text-amber-300">Beperkt bruikbaar{item.status_note ? `: ${item.status_note}` : ''}</p>}
                    {item.warning && <Notice icon="warn">{item.warning}</Notice>}
                    {resp && <Notice icon="user">{RESPONSIBLE_NOTICE} {responsibleLabel(resp)}</Notice>}
                  </div>
                )
              })}
            </div>
          )}

          {!readOnly && (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder={kitIds.length + looseIds.length ? 'Nog een kit of materiaal toevoegen…' : 'Zoek een kit of materiaal…'}
                aria-label="Kit of materiaal zoeken" className={`${inputCls} pl-8`} />
              {(matches.kits.length > 0 || matches.items.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                  {matches.kits.map(k => (
                    <button key={k.id} onClick={() => { setKitIds(ids => [...ids, k.id]); setQuery('') }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                      <Package size={12} className="text-zinc-500" />
                      <span className="text-sm text-zinc-100 flex-1 truncate">{k.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">kit · {k.item_ids.length}</span>
                    </button>
                  ))}
                  {matches.items.map(i => (
                    <button key={i.id} onClick={() => addItem(i.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(i.category_id)?.color }} />
                      <span className="text-sm text-zinc-200 flex-1 truncate">{i.name}</span>
                      <span className="text-[10px] text-zinc-500 truncate">{kitOf.get(i.id) ? `in ${kitOf.get(i.id)!.name}` : categories.get(i.category_id)?.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Voor wie */}
          <div>
            <span className={labelCls}>Voor wie</span>
            <div className="flex flex-wrap gap-1 mb-2" role="radiogroup" aria-label="Soort">
              {(Object.keys(KIND_LABEL) as PersonKind[]).map(k => (
                <button key={k} role="radio" aria-checked={kind === k} disabled={readOnly} onClick={() => setKind(k)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:cursor-default ${kind === k
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {kind === 'collega' && (
              <select value={userIdFor} disabled={readOnly} onChange={e => setUserIdFor(e.target.value)} aria-label="Collega" className={inputCls}>
                <option value="">Kies een collega…</option>
                {(options?.colleagues ?? []).map(p => <option key={p.id} value={p.id}>{p.name}{p.id === userId ? ' (jij)' : ''}</option>)}
                {booking?.booked_for_user_id && !options?.colleagues.some(p => p.id === booking.booked_for_user_id) && (
                  <option value={booking.booked_for_user_id}>{booking.person_name}</option>
                )}
              </select>
            )}
            {kind === 'freelancer' && (
              <select value={freelancerId} disabled={readOnly} onChange={e => setFreelancerId(e.target.value)} aria-label="Freelancer" className={inputCls}>
                <option value="">Kies een freelancer…</option>
                {(options?.freelancers ?? []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            {kind === 'extern' && (
              <input value={external} disabled={readOnly} onChange={e => setExternal(e.target.value)} placeholder="bv. Arne - EXTERN" aria-label="Externe naam" className={inputCls} />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Klant {kind === 'geen' ? '' : '(optioneel)'}</span>
              <select value={clientId} disabled={readOnly} onChange={e => { setClientId(e.target.value); setProjectId('') }} className={inputCls}>
                <option value="">— Geen —</option>
                {(options?.clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {booking?.client && !options?.clients.some(c => c.id === booking.client!.id) && <option value={booking.client.id}>{booking.client.name}</option>}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Project (optioneel)</span>
              <select value={projectId} disabled={readOnly} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">— Geen —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {booking?.project && !projects.some(p => p.id === booking.project!.id) && <option value={booking.project.id}>{booking.project.name}</option>}
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>Notitie (optioneel)</span>
            <input value={note} disabled={readOnly} onChange={e => setNote(e.target.value)} placeholder="bv. shoot Pro League" className={inputCls} />
          </label>

          {booking && <p className="text-[11px] text-zinc-500">Ingegeven door {booking.created_by_name}</p>}

          {editing && (
            <div className="space-y-1.5">
              {unresolved.length > 0 && (
                <p className="text-xs text-amber-300">Kies voor {unresolved.map(p => p.item.name).join(', ')} eerst &ldquo;zonder&rdquo;, of kies andere dagen.</p>
              )}
              {holderError && kind !== 'collega' && <p className="text-xs text-amber-300">{HOLDER_ERROR_TEXT[holderError]}</p>}
              {kind === 'collega' && !userIdFor && <p className="text-xs text-amber-300">Kies een collega.</p>}
              {inPast && <p className="text-xs text-amber-300">Boeken in het verleden kan alleen een beheerder.</p>}
              {outsideWindow && <p className="text-xs text-zinc-500">Een deel valt buiten deze maand; botsingen daar meldt de planner bij het opslaan.</p>}
            </div>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          {booking && editable && !confirmCancel && (
            <button onClick={() => setConfirmCancel(true)} disabled={saving}
              className="px-3 py-2 rounded-lg text-sm text-red-400 border border-red-900/40 hover:bg-red-950/40 disabled:opacity-50">
              Boeking annuleren
            </button>
          )}
          {confirmCancel && (
            <>
              <span className="text-sm text-zinc-300">Zeker?</span>
              <button onClick={cancelBooking} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-700 hover:bg-red-600 disabled:opacity-50">
                {saving && <Loader2 size={13} className="animate-spin" />} Ja, annuleren
              </button>
              <button onClick={() => setConfirmCancel(false)} className="px-2 py-2 text-sm text-zinc-500 hover:text-zinc-300">Nee</button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">Sluiten</button>
            {booking && editable && !editing && (
              <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg text-sm text-zinc-200 border border-zinc-700 hover:border-zinc-500">Wijzigen</button>
            )}
            {editing && (
              <button onClick={save} disabled={!canSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:brightness-110"
                style={{ backgroundColor: ACCENT }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                {booking ? 'Opslaan' : includedCount > 1 ? `${includedCount} stuks boeken` : 'Boeken'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Notice({ icon, children }: { icon: 'user' | 'warn'; children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] text-amber-300 flex items-start gap-1">
      {icon === 'user' ? <UserRound size={10} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />}
      <span>{children}</span>
    </p>
  )
}
