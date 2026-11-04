import { addDays } from '@/lib/gear/dates'
import { shortNames } from '@/lib/gear/labels'
import { brusselsDayStartISO, formatClock, relativeDayLabel } from './time'
import { tripState, type TripState } from './trips'
import type { PoolCar, PoolPlanning, PoolReservation } from './types'

// De agenda voor op de gsm: per dag de ritten, met tijd, wagen, voornaam en
// klant. Een rit over meerdere dagen staat bij elke dag, als "loopt door".

export interface AgendaEntry {
  reservation: PoolReservation
  car: PoolCar
  /** "9:00–12:00", "vanaf 9:00 · loopt door", "tot 12:00 · loopt door", "hele dag · loopt door". */
  time: string
  continues: boolean
  person: string
  state: TripState
}

export interface AgendaDay {
  day: string
  /** "Vandaag", "Morgen", "Vr 7/11". */
  label: string
  entries: AgendaEntry[]
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function buildAgenda(
  planning: PoolPlanning, days: string[], today: string, now: Date, carId: string | null = null,
): AgendaDay[] {
  const cars = new Map(planning.cars.filter(c => !c.archived_at).map(c => [c.id, c]))
  const first = shortNames([...new Set(planning.reservations.map(r => r.person_name))])

  return days.map(day => {
    const dayStart = Date.parse(brusselsDayStartISO(day))
    const dayEnd = Date.parse(brusselsDayStartISO(addDays(day, 1)))
    const entries: AgendaEntry[] = []
    for (const r of planning.reservations) {
      const car = cars.get(r.car_id)
      if (!car || (carId && r.car_id !== carId)) continue
      const state = tripState(r, now)
      // Zoals in het raster: van het werkelijke vertrek tot de werkelijke
      // aankomst; een rit die te laat is, loopt door tot nu.
      const start = Date.parse(r.departed_at ?? r.start_at)
      const end = r.arrived_at ? Date.parse(r.arrived_at)
        : state === 'te_laat' ? Math.max(Date.parse(r.end_at), now.getTime()) : Date.parse(r.end_at)
      if (end <= dayStart || start >= dayEnd) continue

      const before = start < dayStart
      const after = end > dayEnd
      const time = before && after ? 'hele dag · loopt door'
        : before ? `tot ${formatClock(new Date(end))} · loopt door`
        : after ? `vanaf ${formatClock(new Date(start))} · loopt door`
        : `${formatClock(new Date(start))}–${formatClock(new Date(end))}`
      entries.push({ reservation: r, car, time, continues: before || after, person: first.get(r.person_name) ?? r.person_name, state })
    }
    entries.sort((a, b) => Date.parse(a.reservation.departed_at ?? a.reservation.start_at)
      - Date.parse(b.reservation.departed_at ?? b.reservation.start_at))
    return { day, label: capital(relativeDayLabel(day, today)), entries }
  })
}
