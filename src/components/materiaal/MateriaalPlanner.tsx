'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, ChevronLeft, ChevronRight, Loader2, Plus, Search, Settings, X } from 'lucide-react'
import BookingForm from '@/components/materiaal/BookingForm'
import DayList from '@/components/materiaal/DayList'
import MaterialGrid from '@/components/materiaal/MaterialGrid'
import { ACCENT, ErrorLine, send } from '@/components/materiaal/ui'
import type { GearAccess } from '@/lib/gear/access'
import { monthDays, todayInBrussels } from '@/lib/gear/dates'
import { buildGrid } from '@/lib/gear/grid'
import type { GearBooking, GearBookingOptions, GearCatalog } from '@/lib/gear/types'

// De materiaalplanner: één maand, units als rijen. Laadt de catalogus één
// keer en de boekingen per maand — geen timer, geen hele tabel.

const MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

type Dialog =
  | { kind: 'new'; unitIds: string[]; start: string; end: string }
  | { kind: 'open'; booking: GearBooking }

export default function MateriaalPlanner({ userId, access }: { userId: string; access: GearAccess }) {
  const router = useRouter()
  const today = todayInBrussels()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)))
  const [catalog, setCatalog] = useState<GearCatalog | null>(null)
  const [options, setOptions] = useState<GearBookingOptions | null>(null)
  const [bookings, setBookings] = useState<GearBooking[]>([])
  const [loadingMonth, setLoadingMonth] = useState(true)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [mobileDay, setMobileDay] = useState(today)
  // Na opslaan of annuleren de maand opnieuw laden.
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')

  const days = useMemo(() => monthDays(year, month), [year, month])
  const window_ = useMemo(() => ({ start: days[0], end: days[days.length - 1] }), [days])
  const isCurrentMonth = today >= window_.start && today <= window_.end

  useEffect(() => {
    send<GearCatalog>('/api/materiaal/catalog', 'GET').then(setCatalog).catch(e => setError(e.message))
    send<GearBookingOptions>('/api/materiaal/options', 'GET').then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    send<GearBooking[]>(`/api/materiaal/bookings?start=${window_.start}&end=${window_.end}`, 'GET')
      .then(b => { if (alive) setBookings(b) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Laden mislukt.') })
      .finally(() => { if (alive) setLoadingMonth(false) })
    return () => { alive = false }
  }, [window_, reload])

  // Op de telefoon: de gekozen dag, of vandaag / de 1e als die in een andere maand valt.
  const dayInView = days.includes(mobileDay) ? mobileDay : isCurrentMonth ? today : days[0]

  const groups = useMemo(
    () => (catalog ? buildGrid(catalog, bookings, window_, today, search) : []),
    [catalog, bookings, window_, today, search]
  )
  const bookingById = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings])

  function shiftMonth(delta: number) {
    setLoadingMonth(true)
    const m = month - 1 + delta
    setYear(y => y + Math.floor(m / 12))
    setMonth(((m % 12) + 12) % 12 + 1)
  }
  function goToday() {
    if (!isCurrentMonth) setLoadingMonth(true)
    setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))); setMobileDay(today)
  }

  const openBooking = (id: string) => { const b = bookingById.get(id); if (b) setDialog({ kind: 'open', booking: b }) }
  const onSelectRange = useCallback((unitId: string, from: number, to: number) => {
    setDialog({ kind: 'new', unitIds: [unitId], start: days[from], end: days[to] })
  }, [days])

  const noUnits = catalog && catalog.units.length === 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-zinc-100">Materiaal</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} aria-label="Vorige maand" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft size={16} /></button>
            <span className="w-32 text-center text-sm font-medium text-zinc-200">{MONTHS[month - 1]} {year}</span>
            <button onClick={() => shiftMonth(1)} aria-label="Volgende maand" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronRight size={16} /></button>
            {!isCurrentMonth && (
              <button onClick={goToday} className="ml-1 px-2.5 py-1 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800">Vandaag</button>
            )}
            {loadingMonth && <Loader2 size={14} className="ml-2 animate-spin text-zinc-600" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!noUnits && (
            <div className="relative hidden lg:block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek materiaal of houder…" aria-label="Zoek materiaal"
                className="pl-7 pr-7 py-1.5 w-56 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Zoekopdracht wissen" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"><X size={11} /></button>
              )}
            </div>
          )}
          {access.book && !noUnits && (
            <button onClick={() => setDialog({ kind: 'new', unitIds: [], start: today < window_.start ? window_.start : today, end: today < window_.start ? window_.start : today })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white rounded-lg hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              <Plus size={13} /> Boeken
            </button>
          )}
          {access.manageCatalog && (
            <Link href="/materiaal/beheer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 border border-zinc-800 rounded-lg hover:text-zinc-200 hover:bg-zinc-900">
              <Settings size={13} /> Beheer
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
              <Link href="/materiaal/beheer" className="inline-flex mt-5 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: ACCENT }}>
                Naar Beheer
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="hidden lg:block flex-1 overflow-auto">
            {groups.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Niets gevonden voor &ldquo;{search}&rdquo;.</p>
            ) : (
              <MaterialGrid
                days={days}
                today={today}
                groups={groups}
                collapsed={search ? new Set() : collapsed}
                onToggleCategory={id => setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                canBook={access.book}
                onSelectRange={onSelectRange}
                onOpenBooking={openBooking}
                onOpenUnit={id => router.push(`/materiaal/unit/${id}`)}
              />
            )}
          </div>
          <div className="lg:hidden flex flex-col flex-1 min-h-0 px-4 pt-3">
            <DayList
              days={days}
              today={today}
              day={dayInView}
              onDay={setMobileDay}
              groups={groups}
              canBook={access.book}
              onBook={iso => setDialog({ kind: 'new', unitIds: [], start: iso, end: iso })}
              onOpenBooking={openBooking}
            />
          </div>
        </>
      )}

      {dialog && catalog && (
        <BookingForm
          key={dialog.kind === 'open' ? dialog.booking.id : `${dialog.unitIds.join()}-${dialog.start}-${dialog.end}`}
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
          onSaved={() => { setDialog(null); setLoadingMonth(true); setReload(r => r + 1) }}
        />
      )}
    </div>
  )
}
