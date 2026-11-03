'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Loader2, Package, Search, UserRound, X } from 'lucide-react'
import { ACCENT, ErrorLine, inputCls, labelCls, send } from '@/components/materiaal/ui'
import { canChangeBooking, type GearAccess } from '@/lib/gear/access'
import { eachDay } from '@/lib/gear/dates'
import { HOLDER_ERROR_TEXT, validateHolder } from '@/lib/gear/holder'
import { homeNotice } from '@/lib/gear/labels'
import { conflictDays, findConflicts, rangeLength, validateRange, type BookedUnit, type DateRange } from '@/lib/gear/ranges'
import { isBookable, STATUS_LABEL } from '@/lib/gear/status'
import type { GearBooking, GearBookingInput, GearBookingOptions, GearCatalog, GearUnit } from '@/lib/gear/types'

// Boeken, bekijken, wijzigen en annuleren in één venster. Alles wat hier
// gecontroleerd wordt (botsingen, voor wie, defect), controleert de database
// bij opslaan opnieuw; dit is om het meteen te zien.

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
  /** Nieuwe boeking: voorgekozen units en dagen. */
  initial?: { unitIds: string[]; start: string; end: string }
  /** Bestaande boeking openen. */
  booking?: GearBooking
  onClose: () => void
  onSaved: () => void
}

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function BookingForm({ catalog, options, bookings, loadedWindow, today, userId, access, initial, booking, onClose, onSaved }: Props) {
  const editable = booking ? canChangeBooking(booking, userId, access, today) : access.book
  const [editing, setEditing] = useState(!booking)

  const initialKind: PersonKind = booking
    ? booking.booked_for_user_id ? 'collega' : booking.freelancer_id ? 'freelancer' : booking.external_name ? 'extern' : booking.person_name ? 'extern' : 'geen'
    : 'collega'

  const [start, setStart] = useState(booking?.start_date ?? initial?.start ?? today)
  const [end, setEnd] = useState(booking?.end_date ?? initial?.end ?? today)
  const [unitIds, setUnitIds] = useState<string[]>(booking?.unit_ids ?? initial?.unitIds ?? [])
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

  const unitById = useMemo(() => new Map(catalog.units.map(u => [u.id, u])), [catalog.units])
  const categoryById = useMemo(() => new Map(catalog.categories.map(c => [c.id, c])), [catalog.categories])
  const holderById = useMemo(() => new Map(catalog.holders.map(h => [h.id, h])), [catalog.holders])
  const chosen = unitIds.map(id => unitById.get(id)).filter((u): u is GearUnit => !!u)

  const range = { start, end }
  const rangeError = validateRange(range)
  const holderInput = {
    userId: kind === 'collega' ? userIdFor : null,
    freelancerId: kind === 'freelancer' ? freelancerId : null,
    externalName: kind === 'extern' ? external : null,
    clientId,
  }
  const holderError = validateHolder(holderInput)

  const booked: BookedUnit[] = useMemo(() => bookings.flatMap(b => b.unit_ids.map(unitId => ({
    bookingId: b.id, unitId, range: { start: b.start_date, end: b.end_date }, cancelled: false,
    holderLabel: [b.person_name, b.client?.name].filter(Boolean).join(' · ') || 'onbekend',
  }))), [bookings])
  const conflicts = rangeError ? [] : findConflicts(unitIds, range, booked, booking?.id)
  const clashDays = conflictDays(conflicts)
  const outsideWindow = !rangeError && (start < loadedWindow.start || end > loadedWindow.end)

  const unavailable = chosen.filter(u => !isBookable(u.status) && !booking?.unit_ids.includes(u.id))
  const inPast = !rangeError && start < today && !access.manageBookings && start !== booking?.start_date

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return catalog.units
      .filter(u => !unitIds.includes(u.id) && isBookable(u.status))
      .filter(u => u.name.toLowerCase().includes(q) || (categoryById.get(u.category_id)?.name ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, catalog.units, unitIds, categoryById])

  const projects = (options?.projects ?? []).filter(p => !clientId || !p.client_id || p.client_id === clientId)

  const canSave = editing && editable && !saving && unitIds.length > 0 && !rangeError && !holderError
    && conflicts.length === 0 && unavailable.length === 0 && !inPast

  async function save() {
    setSaving(true); setError('')
    const body: GearBookingInput = {
      start_date: start, end_date: end, unit_ids: unitIds,
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
    try {
      await send(`/api/materiaal/bookings/${booking.id}`, 'DELETE')
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Annuleren mislukt.') }
    setSaving(false)
  }

  const readOnly = !editing

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="booking-title"
        className="relative w-full max-w-lg max-h-[90dvh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
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
              <input type="date" value={start} disabled={readOnly}
                min={access.manageBookings ? undefined : today}
                onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }}
                className={inputCls} />
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

          {/* Materiaal */}
          <div>
            <span className={labelCls}>Materiaal{chosen.length > 1 ? ` · ${chosen.length}` : ''}</span>
            <div className="space-y-1.5">
              {chosen.map(u => {
                const clash = conflicts.filter(c => c.unitId === u.id)
                const holder = u.home_client_id ? holderById.get(u.home_client_id) : null
                const cat = categoryById.get(u.category_id)
                return (
                  <div key={u.id} className={`rounded-lg border px-3 py-2 ${clash.length ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800 bg-zinc-950/40'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat?.color }} />
                      <span className="text-sm text-zinc-100 truncate">{u.name}</span>
                      {u.quantity > 1 && <span className="text-[11px] text-zinc-500">×{u.quantity}</span>}
                      {!readOnly && (
                        <button onClick={() => setUnitIds(ids => ids.filter(id => id !== u.id))} aria-label={`${u.name} weghalen`}
                          className="ml-auto text-zinc-600 hover:text-zinc-300"><X size={13} /></button>
                      )}
                    </div>
                    {clash.map(c => (
                      <p key={c.bookingId} className="mt-1 text-[11px] text-red-400">
                        Al weg {fmt(c.days.start)}{c.days.end !== c.days.start ? ` – ${fmt(c.days.end)}` : ''} · {c.holderLabel}
                      </p>
                    ))}
                    {!isBookable(u.status) && <p className="mt-1 text-[11px] text-red-400">{STATUS_LABEL[u.status]}{u.status_note ? `: ${u.status_note}` : ''}</p>}
                    {u.status === 'beperkt' && <p className="mt-1 text-[11px] text-amber-300">Beperkt bruikbaar{u.status_note ? `: ${u.status_note}` : ''}</p>}
                    {u.warning && <p className="mt-1 text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle size={10} />{u.warning}</p>}
                    {holder && <p className="mt-1 text-[11px] text-amber-300 flex items-center gap-1"><UserRound size={10} />{homeNotice(holder.name)}</p>}
                    {u.contents.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-500 flex gap-1">
                        <Package size={10} className="mt-0.5 flex-shrink-0" />
                        <span>{[...u.contents].sort((a, b) => a.sort_order - b.sort_order)
                          .map(c => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${c.label}${c.note ? ` (${c.note})` : ''}`).join(' · ')}</span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            {!readOnly && (
              <div className="relative mt-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder={chosen.length ? 'Nog materiaal toevoegen…' : 'Zoek materiaal…'}
                  aria-label="Materiaal zoeken"
                  className={`${inputCls} pl-8`} />
                {matches.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                    {matches.map(u => (
                      <button key={u.id} onClick={() => { setUnitIds(ids => [...ids, u.id]); setQuery('') }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryById.get(u.category_id)?.color }} />
                        <span className="text-sm text-zinc-200 flex-1 truncate">{u.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{categoryById.get(u.category_id)?.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voor wie */}
          <div>
            <span className={labelCls}>Voor wie</span>
            <div className="flex flex-wrap gap-1 mb-2" role="radiogroup" aria-label="Soort">
              {(Object.keys(KIND_LABEL) as PersonKind[]).map(k => (
                <button key={k} role="radio" aria-checked={kind === k} disabled={readOnly}
                  onClick={() => setKind(k)}
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
              <input value={external} disabled={readOnly} onChange={e => setExternal(e.target.value)}
                placeholder="bv. Arne - EXTERN" aria-label="Externe naam" className={inputCls} />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Klant {kind === 'geen' ? '' : '(optioneel)'}</span>
              <select value={clientId} disabled={readOnly} onChange={e => { setClientId(e.target.value); setProjectId('') }} className={inputCls}>
                <option value="">— Geen —</option>
                {(options?.clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {booking?.client && !options?.clients.some(c => c.id === booking.client!.id) && (
                  <option value={booking.client.id}>{booking.client.name}</option>
                )}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Project (optioneel)</span>
              <select value={projectId} disabled={readOnly} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">— Geen —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {booking?.project && !projects.some(p => p.id === booking.project!.id) && (
                  <option value={booking.project.id}>{booking.project.name}</option>
                )}
              </select>
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>Notitie (optioneel)</span>
            <input value={note} disabled={readOnly} onChange={e => setNote(e.target.value)} placeholder="bv. shoot Pro League" className={inputCls} />
          </label>

          {booking && (
            <p className="text-[11px] text-zinc-500">Ingegeven door {booking.created_by_name}</p>
          )}

          {editing && (
            <div className="space-y-1.5">
              {holderError && kind !== 'collega' && <p className="text-xs text-amber-300">{HOLDER_ERROR_TEXT[holderError]}</p>}
              {kind === 'collega' && !userIdFor && <p className="text-xs text-amber-300">Kies een collega.</p>}
              {inPast && <p className="text-xs text-amber-300">Boeken in het verleden kan alleen een beheerder.</p>}
              {outsideWindow && conflicts.length === 0 && (
                <p className="text-xs text-zinc-500">Een deel valt buiten deze maand; botsingen daar meldt de planner bij het opslaan.</p>
              )}
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
              <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg text-sm text-zinc-200 border border-zinc-700 hover:border-zinc-500">
                Wijzigen
              </button>
            )}
            {editing && (
              <button onClick={save} disabled={!canSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:brightness-110"
                style={{ backgroundColor: ACCENT }}>
                {saving && <Loader2 size={13} className="animate-spin" />}
                {booking ? 'Opslaan' : unitIds.length > 1 ? `${unitIds.length} stuks boeken` : 'Boeken'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
