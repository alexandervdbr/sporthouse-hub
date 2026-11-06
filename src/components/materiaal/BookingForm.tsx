'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Package, Search, UserRound, X } from 'lucide-react'
import { Button, ErrorLine, Field, IconButton, Segmented, Select, formGap, inputCls, labelCls, send } from '@/components/materiaal/ui'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import { eachDay, enteredAfterwards } from '@/lib/gear/dates'
import { HOLDER_ERROR_TEXT, validateHolder } from '@/lib/gear/holder'
import { bookedLines, bookingSelection, checkKitParts, kitByItem, partsToKits, selectionFromBooking, selectionResponsibles, type PartCheck } from '@/lib/gear/kits'
import { conflictDays, findConflicts, rangeLength, validateRange, type Conflict, type DateRange } from '@/lib/gear/ranges'
import { discussWith, responsibleWarning } from '@/lib/gear/responsible'
import { isBookable, STATUS_LABEL } from '@/lib/gear/status'
import type { GearBooking, GearBookingInput, GearBookingOptions, GearCatalog, GearItem, GearKit } from '@/lib/gear/types'

// Boeken, bekijken, wijzigen en annuleren in één venster. Een kit boekt de
// onderdelen die er nu in zitten. Is een onderdeel defect, uit dienst of die
// dagen al elders weg, dan kan de kit alleen mee "zonder" dat onderdeel — en
// dat kies je zelf. De database controleert alles opnieuw bij opslaan.

type PersonKind = 'collega' | 'freelancer' | 'extern' | 'geen'

const KIND_LABEL: Record<PersonKind, string> = {
  collega: 'Collega', freelancer: 'Freelancer', extern: 'Extern', geen: 'Alleen klant',
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
  const categories = useMemo(() => new Map(catalog.categories.map(c => [c.id, c])), [catalog.categories])

  const start0 = booking ? selectionFromBooking(booking, kits) : null
  // Een onderdeel boek je alleen via zijn kit: een voorselectie met onderdelen wordt de kit.
  const pre = initial ? partsToKits(initial.itemIds, initial.kitIds, catalog.kits) : null
  const initialKind: PersonKind = booking
    ? booking.booked_for_user_id ? 'collega' : booking.freelancer_id ? 'freelancer' : booking.person_name ? 'extern' : 'geen'
    : 'collega'

  const [start, setStart] = useState(booking?.start_date ?? initial?.start ?? today)
  const [end, setEnd] = useState(booking?.end_date ?? initial?.end ?? today)
  const [kitIds, setKitIds] = useState<string[]>(start0?.kitIds ?? pre?.kitIds ?? [])
  const [looseIds, setLooseIds] = useState<string[]>(start0?.looseItemIds ?? pre?.itemIds ?? [])
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
  // Met wie het besproken is (per contactpersoon of verantwoordelijke).
  const [discussed, setDiscussed] = useState<Set<string>>(new Set())

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
  // Achteraf boeken mag voor iedereen die boekt; een bestaande boeking naar het verleden verplaatsen blijft Beheren.
  const inPast = !!booking && !rangeError && start < today && !access.manageBookings && start !== booking.start_date
  const afterwards = !rangeError && start < today && !inPast

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { kits: [] as GearKit[], items: [] as GearItem[] }
    const catName = (id: string) => (categories.get(id)?.name ?? '').toLowerCase()
    const itemHit = (i: GearItem | undefined) => !!i && (i.name.toLowerCase().includes(q) || (i.model ?? '').toLowerCase().includes(q))
    return {
      // Ook de kit van een onderdeel dat matcht: onderdelen boek je via hun kit.
      kits: catalog.kits.filter(k => !kitIds.includes(k.id)
        && (k.name.toLowerCase().includes(q) || catName(k.category_id).includes(q) || k.item_ids.some(id => itemHit(items.get(id))))).slice(0, 5),
      items: catalog.items
        .filter(i => !looseIds.includes(i.id) && isBookable(i.status))
        // Geen onderdelen van kits; alleen een weggelaten onderdeel van een gekozen kit kan terug mee.
        .filter(i => { const k = kitOf.get(i.id); return !k || (kitIds.includes(k.id) && excluded.has(i.id)) })
        .filter(i => i.name.toLowerCase().includes(q) || (i.model ?? '').toLowerCase().includes(q) || catName(i.category_id).includes(q))
        .slice(0, 8),
    }
  }, [query, catalog.kits, catalog.items, items, kitIds, looseIds, excluded, kitOf, categories])

  const responsibles = useMemo(() => selectionResponsibles(looseIds, kitIds, excluded, catalog), [looseIds, kitIds, excluded, catalog])
  const discussNames = [...new Set(responsibles.map(discussWith))]
  const allDiscussed = discussNames.every(n => discussed.has(n))

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
    && unresolved.length === 0 && looseProblems.length === 0 && !inPast && allDiscussed

  async function save() {
    setSaving(true); setError('')
    const body: GearBookingInput = {
      start_date: start, end_date: end,
      ...bookingSelection(looseIds, kitIds, excluded, kits),
      user_id: holderInput.userId, freelancer_id: holderInput.freelancerId, external_name: holderInput.externalName,
      client_id: clientId || null, project_id: projectId || null, note,
      responsible_ack: responsibles.length > 0 && allDiscussed,
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
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
          <h2 id="booking-title" className="text-sm font-semibold text-zinc-100">
            {booking ? (editing ? 'Boeking wijzigen' : 'Boeking') : 'Materiaal boeken'}
          </h2>
          <IconButton label="Sluiten" onClick={onClose}><X size={15} /></IconButton>
        </div>

        <div className={`px-5 py-4 ${formGap} overflow-y-auto`}>
          {/* Periode */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className={labelCls}><Calendar size={10} className="inline mr-1" />Ophalen</span>
              <input type="date" value={start} disabled={readOnly} min={booking && !access.manageBookings ? today : undefined}
                onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} className={inputCls} />
            </label>
            <label className="block min-w-0">
              <span className={labelCls}><Calendar size={10} className="inline mr-1" />Terugbrengen</span>
              <input type="date" value={end} min={start} disabled={readOnly} onChange={e => setEnd(e.target.value)} className={inputCls} />
            </label>
          </div>
          {!rangeError && (
            <div className="flex flex-wrap gap-1">
              {eachDay(start, end).slice(0, 31).map(d => (
                <span key={d} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${clashDays.has(d)
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
            const included = parts.filter(p => !excluded.has(p.item.id)).length
            return (
              <div key={id} className={`rounded-xl border ${parts.some(p => p.blocking && !excluded.has(p.item.id)) ? 'border-red-500/40' : 'border-zinc-800'} bg-zinc-950/40`}>
                <div className="flex items-center gap-2 pl-3 pr-1.5 py-1 border-b border-zinc-800/80">
                  <Package size={13} className="text-zinc-500" />
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(kit.category_id)?.color }} />
                  <span className="min-w-0 text-sm font-medium text-zinc-100 truncate" title={kit.name}>{kit.name}</span>
                  <span className="text-[11px] text-zinc-500 flex-shrink-0 whitespace-nowrap">{included} van {parts.length}</span>
                  {!readOnly && (
                    <span className="ml-auto"><IconButton label={`${kit.name} weghalen`} onClick={() => setKitIds(ids => ids.filter(k => k !== id))}><X size={13} /></IconButton></span>
                  )}
                </div>
                <div className="px-3 py-2 space-y-1">
                  {kit.warning && <Notice icon="warn">{kit.warning}</Notice>}
                  {kit.notes && <p className="text-[11px] text-zinc-500">{kit.notes}</p>}
                  <ul className="mt-1 space-y-0.5">
                    {parts.map(p => {
                      const out = excluded.has(p.item.id)
                      return (
                        <li key={p.item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <input type="checkbox" checked={!out} disabled={readOnly || (p.blocking && out)}
                            onChange={e => toggleExcluded(p.item.id, !e.target.checked)}
                            aria-label={`${p.item.name} meenemen`} className="accent-[#3A913F]" />
                          <span title={p.item.name} className={`min-w-0 max-w-full truncate ${out ? 'text-zinc-600 line-through' : p.blocking ? 'text-red-300' : 'text-zinc-300'}`}>{p.item.name}</span>
                          {p.state === 'elders' && p.conflicts.map(c => <span key={c.bookingId} className="text-[11px] text-red-400">{clashText(c)}</span>)}
                          {(p.state === 'defect' || p.state === 'uit_dienst') && <span className="text-[11px] text-red-400">{PART_REASON[p.state]}{p.item.status_note ? `: ${p.item.status_note}` : ''}</span>}
                          {p.state === 'beperkt' && <span className="text-[11px] text-amber-300">Beperkt{p.item.status_note ? `: ${p.item.status_note}` : ''}</span>}
                          {p.item.warning && <span className="text-[11px] text-amber-300">⚠ {p.item.warning}</span>}
                          {p.blocking && !out && !readOnly && (
                            <button type="button" onClick={() => toggleExcluded(p.item.id, true)} title={`Zonder ${p.item.name}`}
                              className="max-w-[14rem] h-6 px-2 rounded-md border border-red-500/40 text-[11px] text-red-300 whitespace-nowrap truncate hover:bg-red-500/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400">
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
                return (
                  <div key={id} className={`rounded-lg border pl-3 pr-1.5 py-1 ${conflicts.length || unavailable ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800 bg-zinc-950/40'}`}>
                    <div className="flex items-center gap-2 min-h-8">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(item.category_id)?.color }} />
                      <span className="min-w-0 text-sm text-zinc-100 truncate" title={item.name}>{item.name}</span>
                      {kitOf.get(id) && <span className="text-[10px] text-zinc-500 whitespace-nowrap">uit {kitOf.get(id)!.name}</span>}
                      {!readOnly && (
                        <span className="ml-auto"><IconButton label={`${item.name} weghalen`} onClick={() => setLooseIds(ids => ids.filter(x => x !== id))}><X size={13} /></IconButton></span>
                      )}
                    </div>
                    {conflicts.map(c => <p key={c.bookingId} className="mt-1 text-[11px] text-red-400">{clashText(c)}</p>)}
                    {unavailable && <p className="mt-1 text-[11px] text-red-400">{STATUS_LABEL[item.status]}{item.status_note ? `: ${item.status_note}` : ''}</p>}
                    {item.status === 'beperkt' && <p className="mt-1 text-[11px] text-amber-300">Beperkt bruikbaar{item.status_note ? `: ${item.status_note}` : ''}</p>}
                    {item.warning && <Notice icon="warn">{item.warning}</Notice>}
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
                aria-label="Kit of materiaal zoeken" className={`${inputCls} pl-9`} />
              {(matches.kits.length > 0 || matches.items.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                  {matches.kits.map(k => (
                    <button key={k.id} onClick={() => { setKitIds(ids => [...ids, k.id]); setQuery('') }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                      <Package size={12} className="text-zinc-500" />
                      <span className="text-sm text-zinc-100 flex-1 min-w-0 truncate" title={k.name}>{k.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500 whitespace-nowrap">kit · {k.item_ids.length}</span>
                    </button>
                  ))}
                  {matches.items.map(i => (
                    <button key={i.id} onClick={() => addItem(i.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categories.get(i.category_id)?.color }} />
                      <span className="text-sm text-zinc-200 flex-1 min-w-0 truncate" title={i.name}>{i.name}</span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[40%]">{kitOf.get(i.id) ? `in ${kitOf.get(i.id)!.name}` : categories.get(i.category_id)?.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Verantwoordelijke: eerst bespreken; boeken mag, maar pas na het vinkje. */}
          {responsibles.length > 0 && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 space-y-2">
              {responsibles.map(r => (
                <p key={`${r.name}|${r.contact ?? ''}`} className="flex items-start gap-2 text-sm text-amber-100">
                  <UserRound size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                  <span>{responsibleWarning(r)}</span>
                </p>
              ))}
              {editing && editable && discussNames.map(n => (
                <label key={n} className="flex items-center gap-2 text-sm text-zinc-100 cursor-pointer">
                  <input type="checkbox" checked={discussed.has(n)} className="accent-[#3A913F] w-4 h-4"
                    onChange={e => setDiscussed(prev => { const s = new Set(prev); if (e.target.checked) s.add(n); else s.delete(n); return s })} />
                  Ik heb dit besproken met {n}
                </label>
              ))}
            </div>
          )}

          {/* Voor wie */}
          <div>
            <span className={labelCls}>Voor wie</span>
            <div className="mb-2">
              <Segmented label="Soort" value={kind} disabled={readOnly} onChange={setKind}
                options={(Object.keys(KIND_LABEL) as PersonKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))} />
            </div>
            {kind === 'collega' && (
              <Select value={userIdFor} disabled={readOnly} onChange={e => setUserIdFor(e.target.value)} aria-label="Collega">
                <option value="">Kies een collega…</option>
                {(options?.colleagues ?? []).map(p => <option key={p.id} value={p.id}>{p.name}{p.id === userId ? ' (jij)' : ''}</option>)}
                {booking?.booked_for_user_id && !options?.colleagues.some(p => p.id === booking.booked_for_user_id) && (
                  <option value={booking.booked_for_user_id}>{booking.person_name}</option>
                )}
              </Select>
            )}
            {kind === 'freelancer' && (
              <Select value={freelancerId} disabled={readOnly} onChange={e => setFreelancerId(e.target.value)} aria-label="Freelancer">
                <option value="">Kies een freelancer…</option>
                {(options?.freelancers ?? []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}
            {kind === 'extern' && (
              <input value={external} disabled={readOnly} onChange={e => setExternal(e.target.value)} placeholder="bv. Arne - EXTERN" aria-label="Externe naam" className={inputCls} />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className={labelCls}>Klant {kind === 'geen' ? '' : '(optioneel)'}</span>
              <Select value={clientId} disabled={readOnly} onChange={e => { setClientId(e.target.value); setProjectId('') }}>
                <option value="">— Geen —</option>
                {(options?.clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {booking?.client && !options?.clients.some(c => c.id === booking.client!.id) && <option value={booking.client.id}>{booking.client.name}</option>}
              </Select>
            </label>
            <label className="block min-w-0">
              <span className={labelCls}>Project (optioneel)</span>
              <Select value={projectId} disabled={readOnly} onChange={e => setProjectId(e.target.value)}>
                <option value="">— Geen —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {booking?.project && !projects.some(p => p.id === booking.project!.id) && <option value={booking.project.id}>{booking.project.name}</option>}
              </Select>
            </label>
          </div>

          <Field label="Notitie (optioneel)">
            <input value={note} disabled={readOnly} onChange={e => setNote(e.target.value)} placeholder="bv. shoot Pro League" className={inputCls} />
          </Field>

          {booking && (
            <p className="text-[11px] text-zinc-500">
              Ingegeven door {booking.created_by_name}{enteredAfterwards(booking.start_date, booking.created_at) && ' · achteraf ingevoerd'}
            </p>
          )}

          {editing && (
            <div className="space-y-1.5">
              {unresolved.length > 0 && (
                <p className="text-xs text-amber-300">Kies voor {unresolved.map(p => p.item.name).join(', ')} eerst &ldquo;zonder&rdquo;, of kies andere dagen.</p>
              )}
              {holderError && kind !== 'collega' && <p className="text-xs text-amber-300">{HOLDER_ERROR_TEXT[holderError]}</p>}
              {kind === 'collega' && !userIdFor && <p className="text-xs text-amber-300">Kies een collega.</p>}
              {inPast && <p className="text-xs text-amber-300">Een boeking naar het verleden verplaatsen kan alleen een beheerder.</p>}
              {afterwards && !booking && <p className="text-xs text-zinc-400">Je boekt achteraf. Dit wordt zo geregistreerd.</p>}
              {!allDiscussed && <p className="text-xs text-amber-300">Vink aan dat je het besproken hebt met {discussNames.filter(n => !discussed.has(n)).join(' en ')}.</p>}
              {outsideWindow && <p className="text-xs text-zinc-500">Een deel valt buiten de getoonde periode; botsingen daar meldt de planner bij het opslaan.</p>}
            </div>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
          {booking && editable && !confirmCancel && (
            <Button variant="danger" onClick={() => setConfirmCancel(true)} disabled={saving}>Boeking annuleren</Button>
          )}
          {confirmCancel && (
            <>
              <span className="text-sm text-zinc-300 whitespace-nowrap">Zeker?</span>
              <Button variant="destructive" onClick={cancelBooking} busy={saving}>Ja, annuleren</Button>
              <Button variant="text" onClick={() => setConfirmCancel(false)}>Nee</Button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="text" onClick={onClose}>Sluiten</Button>
            {booking && editable && !editing && <Button onClick={() => setEditing(true)}>Wijzigen</Button>}
            {editing && (
              <Button variant="primary" onClick={save} disabled={!canSave} busy={saving}>
                {booking ? 'Opslaan' : includedCount > 1 ? `${includedCount} stuks boeken` : 'Boeken'}
              </Button>
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
