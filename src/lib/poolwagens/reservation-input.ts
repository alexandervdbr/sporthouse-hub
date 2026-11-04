import { parseKm } from './car-input'
import { brusselsLocalToISO } from './time'

// Wat de formulieren insturen omzetten naar de argumenten van de functies in
// de database (0077). Tijden komen als Brusselse kloktijd binnen
// ('YYYY-MM-DDTHH:mm'). Alleen de vorm wordt hier gecontroleerd; overlap,
// blokkade, rechten en km-regels bewaakt de database.

type Body = Record<string, unknown>

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)

function time(v: unknown): string | null {
  return typeof v === 'string' ? brusselsLocalToISO(v) : null
}

/** Een kilometerstand die mag ontbreken (dan neemt de database de laatst bekende). */
function optionalKm(v: unknown): { km: number | null } | { error: string } {
  if (v === undefined || v === null || v === '') return { km: null }
  const km = parseKm(v)
  return km === null ? { error: 'De kilometerstand is een geheel getal vanaf 0.' } : { km }
}

export interface ReservationArgs {
  p_car_id: string
  p_start_at: string
  p_end_at: string
  p_project_id: string
  p_note: string | null
}

export function parseReservationInput(body: unknown): { args: ReservationArgs } | { error: string } {
  const b = (body ?? {}) as Body
  const car = uuid(b.car_id)
  if (!car) return { error: 'Kies een wagen.' }
  const start = time(b.start)
  const end = time(b.end)
  if (!start || !end) return { error: 'Kies een vertrek en een verwachte terugkomst.' }
  if (Date.parse(end) <= Date.parse(start)) return { error: 'De terugkomst ligt na het vertrek.' }
  const project = uuid(b.project_id)
  if (!project) return { error: 'Kies een project.' }
  return { args: { p_car_id: car, p_start_at: start, p_end_at: end, p_project_id: project, p_note: text(b.note) } }
}

export interface DepartNowArgs {
  p_car_id: string
  p_end_at: string
  p_project_id: string
  p_note: string | null
  p_km: number | null
}

/** "Nu vertrekken": geen vertrektijd (dat is nu), wel een verwachte terugkomst. */
export function parseDepartNowInput(body: unknown, now: Date = new Date()): { args: DepartNowArgs } | { error: string } {
  const b = (body ?? {}) as Body
  const car = uuid(b.car_id)
  if (!car) return { error: 'Kies een wagen.' }
  const end = time(b.end)
  if (!end) return { error: 'Kies een verwachte terugkomst.' }
  if (Date.parse(end) <= now.getTime()) return { error: 'De verwachte terugkomst ligt in de toekomst.' }
  const project = uuid(b.project_id)
  if (!project) return { error: 'Kies een project.' }
  const km = optionalKm(b.km)
  if ('error' in km) return km
  return { args: { p_car_id: car, p_end_at: end, p_project_id: project, p_note: text(b.note), p_km: km.km } }
}

/** Vertrek: tijdstip en km-stand mogen ontbreken (nu, laatst bekende stand). */
export function parseDepartureInput(body: unknown): { args: { p_departed_at: string | null; p_km: number | null } } | { error: string } {
  const b = (body ?? {}) as Body
  let at: string | null = null
  if (b.at !== undefined && b.at !== null && b.at !== '') {
    at = time(b.at)
    if (!at) return { error: 'Ongeldig tijdstip van vertrek.' }
  }
  const km = optionalKm(b.km)
  if ('error' in km) return km
  return { args: { p_departed_at: at, p_km: km.km } }
}

/** Aankomst: de km-stand is verplicht, het tijdstip standaard nu. */
export function parseArrivalInput(body: unknown): { args: { p_arrived_at: string | null; p_km: number } } | { error: string } {
  const b = (body ?? {}) as Body
  let at: string | null = null
  if (b.at !== undefined && b.at !== null && b.at !== '') {
    at = time(b.at)
    if (!at) return { error: 'Ongeldig tijdstip van aankomst.' }
  }
  if (b.km === undefined || b.km === null || b.km === '') return { error: 'Vul de kilometerstand bij aankomst in.' }
  const km = parseKm(b.km)
  if (km === null) return { error: 'De kilometerstand is een geheel getal vanaf 0.' }
  return { args: { p_arrived_at: at, p_km: km } }
}

export { uuid as parseUuid }
