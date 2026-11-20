import { parseKm } from './car-input'
import { isEmail } from './email'
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

export const MAX_GUEST_NAME = 100

export interface PersonArgs {
  p_user_id: string | null
  p_guest_name: string | null
  p_guest_email: string | null
}

/**
 * Voor wie (optioneel): een collega (user_id), of een stagiair zonder account
 * (guest: naam + e-mail). Leeg is de ingelogde gebruiker. Of die collega mag
 * (bestaand account, geen freelancer) en of het e-mailadres niet bij een
 * account hoort, controleert de database.
 */
function person(b: Body): PersonArgs | { error: string } {
  const none = { p_user_id: null, p_guest_name: null, p_guest_email: null }
  if (b.guest !== undefined && b.guest !== null) {
    const g = b.guest as Body
    const name = text(g.name)
    const email = text(g.email)?.toLowerCase() ?? null
    if (!name) return { error: 'Vul de naam van de stagiair in.' }
    if (name.length > MAX_GUEST_NAME) return { error: `De naam van de stagiair is hoogstens ${MAX_GUEST_NAME} tekens.` }
    if (!email || !isEmail(email)) return { error: 'Vul een geldig e-mailadres van de stagiair in.' }
    if (b.user_id) return { error: 'Kies een collega of een stagiair, niet allebei.' }
    return { ...none, p_guest_name: name, p_guest_email: email }
  }
  if (b.user_id === undefined || b.user_id === null || b.user_id === '') return none
  const id = uuid(b.user_id)
  return id ? { ...none, p_user_id: id } : { error: 'Ongeldige collega.' }
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

export interface ReservationArgs extends PersonArgs {
  p_car_id: string
  p_start_at: string
  p_end_at: string
  p_client_id: string | null
  p_client_name: string | null
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
  const c = client(b)
  if ('error' in c) return c
  const who = person(b)
  if ('error' in who) return who
  return { args: { p_car_id: car, p_start_at: start, p_end_at: end, ...c, p_note: text(b.note), ...who } }
}

export interface DepartNowArgs extends PersonArgs {
  p_car_id: string
  p_end_at: string
  p_client_id: string | null
  p_client_name: string | null
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
  const c = client(b)
  if ('error' in c) return c
  const km = optionalKm(b.km)
  if ('error' in km) return km
  const who = person(b)
  if ('error' in who) return who
  return { args: { p_car_id: car, p_end_at: end, ...c, p_note: text(b.note), p_km: km.km, ...who } }
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

const PERSON_KEYS = ['p_user_id', 'p_guest_name', 'p_guest_email'] as const

/**
 * De argumenten voor de database, zonder de lege "voor wie"-velden (dan
 * reserveer je voor jezelf). Zo blijft gewoon reserveren werken zolang een
 * nieuwere migratie nog niet gedraaid is: "voor een collega" heeft 0080
 * nodig, "voor een stagiair" 0095.
 */
export function rpcArgs<T extends PersonArgs>(args: T): Partial<T> {
  const out: Partial<T> = { ...args }
  for (const k of PERSON_KEYS) if (out[k] === null) delete out[k]
  return out
}
