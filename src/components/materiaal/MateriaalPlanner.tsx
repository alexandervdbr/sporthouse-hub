'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Camera, ChevronLeft, ChevronRight, Loader2, Plus, Search, Settings, X } from 'lucide-react'
import AddGearDialog from '@/components/materiaal/AddGearDialog'
import BookingForm from '@/components/materiaal/BookingForm'
import GearPanel, { type AddPrefill, type PanelTarget } from '@/components/materiaal/GearPanel'
import { useGearActions } from '@/components/materiaal/useGearActions'
import { planAddToKit } from '@/lib/gear/inventory'
import DayAgenda from '@/components/materiaal/DayAgenda'
import MaterialGrid, { type GridTarget } from '@/components/materiaal/MaterialGrid'
import { Button, ErrorLine, IconButton, Segmented, buttonCls, inputCls, send } from '@/components/materiaal/ui'
import type { GearAccess } from '@/lib/gear/access'
import { eachDay, todayInBrussels } from '@/lib/gear/dates'
import { buildDayList, type DayFilter } from '@/lib/gear/day-list'
import { buildGrid, busyFor } from '@/lib/gear/grid'
import { gapTimes, suggestTimes, type Slot } from '@/lib/gear/times'
import { moveCategory } from '@/lib/gear/categories'
import type { GearBooking, GearBookingOptions, GearCatalog } from '@/lib/gear/types'
import {
  DEFAULT_VIEW, PLANNER_VIEWS, PLANNER_VIEW_LABEL, isPlannerView, parseViewParams, shiftView, shortDayLabel, showsToday, viewLabel, viewRange, type PlannerView,
} from '@/lib/gear/views'

// De materiaalplanner: een dag, een week of een maand, units als rijen.
// Laadt de catalogus één keer en de boekingen van de zichtbare periode —
// geen timer, geen hele tabel. Weergave en datum staan in de URL
// (?view=week&date=2026-11-05); de laatst gekozen weergave onthoudt de
// browser. Op de telefoon altijd de dagweergave.

const VIEW_KEY = 'materiaal-weergave'
const VIEW_OPTIONS = PLANNER_VIEWS.map(v => ({ value: v, label: PLANNER_VIEW_LABEL[v] }))
const UNIT: Record<PlannerView, string> = { day: 'dag', week: 'week', month: 'maand' }
const LABEL_W: Record<PlannerView, string> = { day: 'lg:w-44', week: 'lg:w-64', month: 'lg:w-32' }

// Browserzaken die de server niet kent: of het een telefoon is, en welke
// weergave onthouden was. Op de server (en bij de eerste render) "onbekend",
// zodat er pas geladen wordt als het vaststaat.
const PHONE = '(max-width: 1023px)'
const subscribePhone = (cb: () => void) => { const mq = window.matchMedia(PHONE); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) }
const noSubscribe = () => () => {}
function storedView(): PlannerView | null {
  try { const v = localStorage.getItem(VIEW_KEY); return isPlannerView(v) ? v : null } catch { return null /* privévenster */ }
}

type Dialog =
  | { kind: 'new'; kitIds: string[]; itemIds: string[]; start: string; end: string; startTime?: string | null; endTime?: string | null }
  | { kind: 'open'; booking: GearBooking }

export default function MateriaalPlanner({ userId, access, initialView, initialDate }: {
  userId: string
  access: GearAccess
  /** Uit de URL; ontbreekt die, dan de laatst gekozen weergave. */
  initialView?: string
  initialDate?: string
}) {
  const today = todayInBrussels()
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false)
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
  const remembered = useSyncExternalStore(noSubscribe, storedView, () => null)
  // Gekozen in deze sessie, of uit de URL; anders de onthouden weergave.
  const [chosen, setChosen] = useState<PlannerView | null>(isPlannerView(initialView) ? initialView : null)
  const view = chosen ?? remembered ?? DEFAULT_VIEW
  const [date, setDate] = useState(() => parseViewParams({ date: initialDate }, DEFAULT_VIEW, today).date)
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  // Zijpaneel met de details van een categorie, kit of item (bewerken met Beheren).
  const [panel, setPanel] = useState<PanelTarget | null>(null)
  const [add, setAdd] = useState<AddPrefill | null>(null)
  const [options, setOptions] = useState<GearBookingOptions | null>(null)
  const [bookings, setBookings] = useState<GearBooking[]>([])
  // Welk venster (en welke herlaadbeurt) er geladen is; verschilt het, dan laadt het nog.
  const [loadedKey, setLoadedKey] = useState('')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Welke kits opengeklapt zijn (hun onderdelen zichtbaar).
  const [openKits, setOpenKits] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  // Na opslaan of annuleren de periode opnieuw laden.
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')

  // De link toont dezelfde weergave; vervangen, niet toevoegen, zodat "terug" niet elke stap afloopt.
  useEffect(() => {
    if (!ready) return
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    url.searchParams.set('date', date)
    window.history.replaceState(null, '', url)
  }, [ready, view, date])

  const shown: PlannerView = phone ? 'day' : view
  const { start: rangeStart, end: rangeEnd } = viewRange(shown, date)
  const window_ = useMemo(() => ({ start: rangeStart, end: rangeEnd }), [rangeStart, rangeEnd])
  const days = useMemo(() => eachDay(window_.start, window_.end), [window_])
  const inView = showsToday(shown, date, today)
  const loadKey = `${window_.start}:${window_.end}:${reload}`
  const loading = loadedKey !== loadKey

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
    send<GearBookingOptions>('/api/materiaal/options', 'GET').then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    if (!ready) return
    let alive = true
    send<GearBooking[]>(`/api/materiaal/bookings?start=${window_.start}&end=${window_.end}`, 'GET')
      .then(b => { if (alive) setBookings(b) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Laden mislukt.') })
      .finally(() => { if (alive) setLoadedKey(loadKey) })
    return () => { alive = false }
  }, [ready, window_, loadKey])

  const groups = useMemo(
    () => (catalog && shown !== 'day' ? buildGrid(catalog, bookings, window_, today, search) : []),
    [catalog, shown, bookings, window_, today, search]
  )
  const dayGroups = useMemo(
    () => (catalog && shown === 'day' ? buildDayList(catalog, bookings, date, today, dayFilter, search) : []),
    [catalog, shown, bookings, date, today, dayFilter, search]
  )
  const bookingById = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings])

  function chooseView(v: PlannerView) {
    setChosen(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* privévenster */ }
  }

  const openBooking = (id: string) => { const b = bookingById.get(id); if (b) setDialog({ kind: 'open', booking: b }) }
  // Klik of sleep: met de uren waarop het vrij is ("tot 10:00 weg" → ophalen 10:00).
  // Botst er dan nog iets, dan zegt het formulier welk deel.
  const onSelectRange = useCallback((target: GridTarget, from: number, to: number) => {
    const t = suggestTimes(days[from], days[to], busyFor(target, bookings))
    setDialog({
      kind: 'new', kitIds: target.kind === 'kit' ? [target.id] : [], itemIds: target.kind === 'item' ? [target.id] : [],
      start: days[from], end: days[to], startTime: t.startTime, endTime: t.endTime,
    })
  }, [days, bookings])
  // Dagweergave: een vrij stuk ("vrij 10:00–14:00") vult beide uren in.
  const onBookDay = (target: GridTarget, gap?: Slot) => {
    if (!gap) return onSelectRange(target, 0, 0)
    setDialog({ kind: 'new', kitIds: target.kind === 'kit' ? [target.id] : [], itemIds: target.kind === 'item' ? [target.id] : [], start: date, end: date, ...gapTimes(gap, date) })
  }

  // Categorie verslepen in het raster (alleen admins): meteen tonen, dan
  // opslaan via dezelfde route als Beheer; bij een fout terugzetten. Komt op
  // de stapel van Ctrl+Z.
  async function reorderCategory(activeId: string, overId: string) {
    if (!catalog) return
    const previous = catalog.categories
    const next = moveCategory(previous, activeId, overId)
    if (!next) return
    setCatalog(c => (c ? { ...c, categories: next } : c))
    setError('')
    const save = (cats: typeof previous) => send('/api/materiaal/categories', 'PATCH', { order: cats.map(c => c.id) })
    try {
      await save(next)
      actions.record({ label: `${previous.find(c => c.id === activeId)?.name ?? 'Categorie'} verplaatst`, undo: () => save(previous).then(() => {}), redo: () => save(next).then(() => {}) })
    } catch (e) {
      setCatalog(c => (c ? { ...c, categories: previous } : c))
      setError(e instanceof Error ? e.message : 'De volgorde kon niet opgeslagen worden.')
    }
  }

  const reloadCatalog = useCallback(async () => {
    try { setCatalog(await send<GearCatalog>('/api/materiaal/catalog', 'GET')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Laden mislukt.') }
  }, [])
  const actions = useGearActions({ catalog, reload: reloadCatalog, onError: setError })
  const people = useMemo(() => ({
    colleagues: (options?.colleagues ?? []).map(c => ({ id: c.id, name: c.name })),
    clients: [...new Map([...(catalog?.clients ?? []), ...(options?.clients ?? [])].map(c => [c.id, c])).values()],
  }), [options, catalog])

  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void) => (id: string) =>
    set(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const noUnits = catalog && catalog.items.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Telefoon: titel en knoppen bovenaan, de datum als eigen volle regel eronder. */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6 py-3 lg:py-4 border-b border-zinc-800">
        <h1 className="order-1 text-base sm:text-lg font-semibold text-zinc-100">Materiaal</h1>
        <div className="order-2 hidden lg:block w-48 flex-shrink-0">
          <Segmented label="Weergave" value={view} options={VIEW_OPTIONS} onChange={chooseView} />
        </div>
        <div className="order-4 lg:order-3 w-full lg:w-auto flex items-center gap-1">
          <IconButton label={`Vorige ${UNIT[shown]}`} onClick={() => setDate(d => shiftView(shown, d, -1))}><ChevronLeft size={16} /></IconButton>
          <span className={`flex-1 lg:flex-none min-w-0 ${LABEL_W[shown]} text-center text-sm font-medium text-zinc-200 whitespace-nowrap truncate`}>
            {phone ? shortDayLabel(date, today) : viewLabel(shown, date)}
          </span>
          <IconButton label={`Volgende ${UNIT[shown]}`} onClick={() => setDate(d => shiftView(shown, d, 1))}><ChevronRight size={16} /></IconButton>
          {!inView && <Button size="sm" onClick={() => setDate(today)} className="ml-1">Vandaag</Button>}
          {loading && <Loader2 size={14} className="ml-2 animate-spin text-zinc-600" />}
        </div>
        <div className="order-2 lg:order-4 ml-auto flex items-center gap-2">
          {!noUnits && (
            <div className="relative hidden lg:block">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek materiaal of houder…" aria-label="Zoek materiaal"
                className={`${inputCls} !w-60 pl-9 pr-9`} />
              {search && (
                <span className="absolute right-0.5 top-1/2 -translate-y-1/2"><IconButton label="Zoekopdracht wissen" onClick={() => setSearch('')}><X size={12} /></IconButton></span>
              )}
            </div>
          )}
          {access.book && !noUnits && (
            <Button variant="primary" onClick={() => setDialog({ kind: 'new', kitIds: [], itemIds: [], start: today < window_.start ? window_.start : today, end: today < window_.start ? window_.start : today })}>
              <Plus size={14} /> Boeken
            </Button>
          )}
          {access.manageCatalog && (
            <Link href="/materiaal/beheer" className={buttonCls('secondary')}>
              <Settings size={14} /> Beheer
            </Link>
          )}
        </div>
      </div>

      {error && <div className="px-4 sm:px-6 pt-3"><ErrorLine>{error}</ErrorLine></div>}

      {!catalog ? (
        <div className="p-8"><Loader2 size={20} className="animate-spin text-zinc-600" /></div>
      ) : noUnits ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center border border-zinc-800 bg-zinc-900">
              <Camera size={20} className="text-zinc-500" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Nog geen materiaal</h2>
            <p className="mt-1.5 text-sm text-zinc-500">
              {access.manageCatalog
                ? 'Zet de categorieën en het materiaal klaar in Beheer; je kan een hele lijst in één keer plakken.'
                : 'Zodra een beheerder het materiaal heeft ingegeven, kan je hier boeken.'}
            </p>
            {access.manageCatalog && (
              <Link href="/materiaal/beheer" className={`${buttonCls('primary')} mt-5`}>
                Naar Beheer
              </Link>
            )}
          </div>
        </div>
      ) : shown === 'day' ? (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <DayAgenda
            groups={dayGroups}
            day={date}
            today={today}
            collapsed={search ? new Set() : collapsed}
            onToggleCategory={toggle(setCollapsed)}
            openKits={search ? new Set(catalog.kits.map(k => k.id)) : openKits}
            onToggleKit={toggle(setOpenKits)}
            canBook={access.book}
            onBook={onBookDay}
            onOpenBooking={openBooking}
            onOpenItem={id => setPanel({ type: 'item', id })}
            onOpenKit={id => setPanel({ type: 'kit', id })}
            onOpenCategory={id => setPanel({ type: 'category', id })}
            filter={dayFilter}
            onFilter={setDayFilter}
            search={search}
            onSearch={setSearch}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
            {groups.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Niets gevonden voor &ldquo;{search}&rdquo;.</p>
            ) : (
              <MaterialGrid
                days={days}
                today={today}
                groups={groups}
                collapsed={search ? new Set() : collapsed}
                onToggleCategory={toggle(setCollapsed)}
                // Bij zoeken klappen de kits open, zodat je ziet welk onderdeel matcht.
                openKits={search ? new Set(catalog.kits.map(k => k.id)) : openKits}
                onToggleKit={toggle(setOpenKits)}
                canBook={access.book}
                onSelectRange={onSelectRange}
                onOpenBooking={openBooking}
                onOpenItem={id => setPanel({ type: 'item', id })}
                onOpenKit={id => setPanel({ type: 'kit', id })}
                onOpenCategory={id => setPanel({ type: 'category', id })}
                canReorderCategories={access.reorderCategories}
                onReorderCategory={reorderCategory}
                wide={shown === 'week'}
              />
            )}
        </div>
      )}

      {panel && catalog && (
        <GearPanel target={panel} catalog={catalog} people={people} access={access}
          onClose={() => setPanel(null)} onOpen={setPanel} reload={reloadCatalog} run={actions.run} deleteCategory={actions.deleteCategory} dissolveKit={actions.dissolveKit} setItemStatus={actions.setItemStatus} onAdd={setAdd}
          onChange={fn => setCatalog(c => (c ? fn(c) : c))} />
      )}
      {add && catalog && (
        <AddGearDialog catalog={catalog} prefill={add} onClose={() => setAdd(null)}
          onAddToKit={(items, kit) => actions.run(planAddToKit(items, kit))}
          onCreated={async t => { setAdd(null); await reloadCatalog(); if (t) setPanel(t) }} />
      )}
      {actions.ui}
      {dialog && catalog && (
        <BookingForm
          key={dialog.kind === 'open' ? dialog.booking.id : `${dialog.kitIds.join()}-${dialog.itemIds.join()}-${dialog.start}-${dialog.end}`}
          catalog={catalog}
          options={options}
          bookings={bookings}
          loadedWindow={window_}
          today={today}
          userId={userId}
          access={access}
          initial={dialog.kind === 'new' ? dialog : undefined}
          booking={dialog.kind === 'open' ? dialog.booking : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setReload(r => r + 1) }}
        />
      )}
    </div>
  )
}
