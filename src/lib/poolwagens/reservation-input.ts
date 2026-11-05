import { parseKm } from './car-input'
import { brusselsLocalToISO } from './time'

// Wat de formulieren insturen omzetten naar de argumenten van de functies in
// de database (0077, 0079). Tijden komen als Brusselse kloktijd binnen
// ('YYYY-MM-DDTHH:mm'). Alleen de vorm wordt hier gecontroleerd; overlap,
// blokkade, rechten en km-regels bewaakt de database.

type Body = Record<string, unknown>

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)

export const MAX_CLIENT_NAME = 200

/**
 * Klant (optioneel): een bestaande klant (id) of een getypte naam. Met een id
 * neemt de database de naam van die klant; een getypte naam ernaast telt dan
 * niet.
 */
function client(b: Body): { p_client_id: string | null; p_client_name: string | null } | { error: string } {
  if (b.client_id !== undefined && b.client_id !== null && b.client_id !== '') {
    const id = uuid(b.client_id)
    if (!id) return { error: 'Ongeldige klant.' }
    return { p_client_id: id, p_client_name: null }
  }
  const name = text(b.client_name)
  if (name && name.length > MAX_CLIENT_NAME) return { error: `De klantnaam is hoogstens ${MAX_CLIENT_NAME} tekens.` }
  return { p_client_id: null, p_client_name: name }
}

/**
 * Voor wie (optioneel): een collega. Leeg is de ingelogde gebruiker. Of die
 * collega mag (bestaand account, geen freelancer), controleert de database.
 */
function person(b: Body): { p_user_id: string | null } | { error: string } {
  if (b.user_id === undefined || b.user_id === null || b.user_id === '') return { p_user_id: null }
  const id = uuid(b.user_id)
  return id ? { p_user_id: id } : { error: 'Ongeldige collega.' }
}

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
  p_client_id: string | null
  p_client_name: string | null
  p_note: string | null
  p_user_id: string | null
}

export function parseReservationInput(body: unknown): { args: ReservationArgs } | { error: string } {
  const b = (body ?? {}) as Body
  const car = uuid(b.car_id)
  if (!car) return { error: 'Kies een wagen.' }
  const start = time(b.start)
  const end = time(b.end)
  if (!start || !end) return { error: 'Kies een vertrek en een verwachte terugkomst.' }
  if (Date.parse(end) <= Date.parse(start)) return { error: 'De terugkomst ligt na het vertrek.' }
  const c = client(b)
  if ('error' in c) return c
  const who = person(b)
  if ('error' in who) return who
  return { args: { p_car_id: car, p_start_at: start, p_end_at: end, ...c, p_note: text(b.note), ...who } }
}

export interface DepartNowArgs {
  p_car_id: string
  p_end_at: string
  p_client_id: string | null
  p_client_name: string | null
  p_note: string | null
  p_km: number | null
  p_user_id: string | null
}

/** "Nu vertrekken": geen vertrektijd (dat is nu), wel een verwachte terugkomst. */
export function parseDepartNowInput(body: unknown, now: Date = new Date()): { args: DepartNowArgs } | { error: string } {
  const b = (body ?? {}) as Body
  const car = uuid(b.car_id)
  if (!car) return { error: 'Kies een wagen.' }
  const end = time(b.end)
  if (!end) return { error: 'Kies een verwachte terugkomst.' }
  if (Date.parse(end) <= now.getTime()) return { error: 'De verwachte terugkomst ligt in de toekomst.' }
  const c = client(b)
  if ('error' in c) return c
  const km = optionalKm(b.km)
  if ('error' in km) return km
  const who = person(b)
  if ('error' in who) return who
  return { args: { p_car_id: car, p_end_at: end, ...c, p_note: text(b.note), p_km: km.km, ...who } }
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

/**
 * De argumenten voor de database, zonder p_user_id als dat leeg is (dan
 * reserveer je voor jezelf). Zo blijft gewoon reserveren werken zolang
 * migratie 0080 nog niet gedraaid is; alleen "voor een collega" heeft ze nodig.
 */
export function rpcArgs<T extends { p_user_id: string | null }>(args: T): T | Omit<T, 'p_user_id'> {
  if (args.p_user_id) return args
  const { p_user_id: _skip, ...rest } = args
  void _skip
  return rest
}
