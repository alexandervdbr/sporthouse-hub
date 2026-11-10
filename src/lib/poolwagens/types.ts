// Vormen zoals de API van /poolwagens ze teruggeeft.

export interface PoolCar {
  id: string
  name: string
  license_plate: string
  make_model: string | null
  current_km: number
  manual_block: boolean
  manual_block_note: string | null
  archived_at: string | null
  created_at: string
  /** De laatste vier tekens van de tankkaart (0087), of null. Het volledige nummer en de pincode staan afgeschermd. */
  fuel_card_last4: string | null
}

export const CAR_COLUMNS =
  'id, name, license_plate, make_model, current_km, manual_block, manual_block_note, archived_at, created_at, fuel_card_last4'

/** De tankkaart zoals beheer ze ziet (pool_fuel_cards): het volledige nummer, en of er een pincode is. */
export interface FuelCard {
  car_id: string
  card_number: string | null
  has_pin: boolean
}

export interface ClientRef {
  id: string
  name: string
}

/** Een reservatie; vanaf het vertrek ook een rit. */
export interface PoolReservation {
  id: string
  car_id: string
  user_id: string | null
  person_name: string
  /** Gekoppelde klant uit de hub, of null (ook bij een getypte naam). */
  client_id: string | null
  /** De klant zoals getoond: kopie van de naam, of zelf getypt. */
  client_name: string | null
  start_at: string
  end_at: string
  note: string | null
  departed_at: string | null
  departure_km: number | null
  arrived_at: string | null
  arrival_km: number | null
  driven_km: number | null
  created_by: string | null
  /** Wie de reservatie maakte; kan iemand anders zijn dan person_name (0080). */
  created_by_name: string | null
}

export const RESERVATION_COLUMNS =
  'id, car_id, user_id, person_name, client_id, client_name, start_at, end_at, note, departed_at, departure_km, arrived_at, arrival_km, driven_km, created_by, created_by_name'

export type DamageSeverity = 'licht' | 'ernstig'
export type DamageStatus = 'gemeld' | 'in_behandeling' | 'hersteld'
export type MailStatus = 'verstuurd' | 'mislukt' | 'niet_geconfigureerd' | 'geen_ontvangers'

export interface DamagePhoto {
  id: string
  filename: string
}

export interface DamageReport {
  id: string
  car_id: string
  reservation_id: string | null
  description: string
  severity: DamageSeverity
  status: DamageStatus
  reported_by: string | null
  reported_by_name: string
  created_at: string
  status_changed_at: string | null
  status_changed_by_name: string | null
  block_lifted_at: string | null
  block_lifted_by_name: string | null
  /** Alleen voor beheer; voor anderen altijd null. */
  mail_status: MailStatus | null
  mail_error: string | null
  photos: DamagePhoto[]
}

export const DAMAGE_COLUMNS =
  'id, car_id, reservation_id, description, severity, status, reported_by, reported_by_name, created_at, status_changed_at, status_changed_by_name, block_lifted_at, block_lifted_by_name, mail_status, mail_error, pool_car_damage_photos(id, filename)'

/** Alles wat het planningsoverzicht voor een venster nodig heeft, in één verzoek. */
export interface PoolPlanning {
  cars: PoolCar[]
  reservations: PoolReservation[]
  /** Ernstige meldingen die hun wagen nu blokkeren. */
  blockingDamage: { id: string; car_id: string; created_at: string }[]
  now: string
}

export interface PoolOptions {
  clients: ClientRef[]
  colleagues: { id: string; name: string }[]
}

export interface PoolSettingsResponse {
  recipients: string[]
  mailConfigured: boolean
  pushConfigured: boolean
  driveConfigured: boolean
}
