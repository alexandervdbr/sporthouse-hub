import type { UnitStatus } from './status'

// Vormen zoals de API van /materiaal ze teruggeeft (na 0074/0075: items en
// kits in plaats van units).

export interface GearCategory {
  id: string
  name: string
  color: string
  sort_order: number
}

/**
 * Verantwoordelijke: een klant óf een collega (met naamkopie), en eventueel
 * een contactpersoon: een collega (account, met naamkopie) of een vrije naam.
 */
export interface GearResponsible {
  responsible_client_id: string | null
  responsible_user_id: string | null
  responsible_name: string | null
  contact_user_id?: string | null
  contact_name?: string | null
}

/** Eén fysiek voorwerp: body, lens, batterij, kabel, … */
export interface GearItem extends GearResponsible {
  id: string
  category_id: string
  name: string
  model: string | null
  number: string | null
  serial_number: string | null
  sort_order: number
  label_color: string | null
  nd_size: string | null
  warning: string | null
  notes: string | null
  status: UnitStatus
  status_note: string | null
}

/** Een groep items die samen gaan. item_ids in de volgorde van de kit. */
export interface GearKit extends GearResponsible {
  id: string
  category_id: string
  name: string
  label_color: string | null
  warning: string | null
  notes: string | null
  sort_order: number
  item_ids: string[]
}

export interface GearClientRef {
  id: string
  name: string
  color: string | null
}

export interface GearCatalog {
  categories: GearCategory[]
  items: GearItem[]
  /** Alleen de kits die niet opgeheven zijn. */
  kits: GearKit[]
  /** De klanten die als verantwoordelijke voorkomen, met naam en kleur. */
  clients: GearClientRef[]
}

export interface GearPerson {
  id: string
  name: string
  email: string
}

export interface GearStatusLogEntry {
  id: string
  old_status: UnitStatus | null
  new_status: UnitStatus
  note: string | null
  changed_by_name: string
  changed_at: string
}

export interface GearMembershipEntry {
  kit_id: string
  kit_name: string
  added_at: string
  added_by_name: string
  removed_at: string | null
  removed_by_name: string | null
}

export interface GearItemBooking {
  id: string
  start_date: string
  end_date: string
  person_name: string | null
  client: GearClientRef | null
  note: string | null
  created_by_name: string
  created_at?: string
  cancelled_at: string | null
  via_kit_name: string | null
}

export interface GearItemHistory {
  status: GearStatusLogEntry[]
  bookings: GearItemBooking[]
  memberships: GearMembershipEntry[]
}

/** Eén regel van een boeking: welk item, en of het "via" een kit kwam. */
export interface GearBookingLine {
  item_id: string
  via_kit_id: string | null
  via_kit_name: string | null
}

export interface GearBooking {
  id: string
  start_date: string
  end_date: string
  lines: GearBookingLine[]
  booked_for_user_id: string | null
  freelancer_id: string | null
  external_name: string | null
  /** Naam van de persoon (kopie), null bij een boeking voor alleen een klant. */
  person_name: string | null
  client: GearClientRef | null
  project: { id: string; name: string } | null
  note: string | null
  created_by: string | null
  created_by_name: string
  created_at?: string
}

export interface GearBookingOptions {
  colleagues: GearPerson[]
  freelancers: { id: string; name: string }[]
  clients: GearClientRef[]
  projects: { id: string; name: string; client_id: string | null }[]
}

/** Wat het formulier naar de API stuurt bij boeken of wijzigen. */
export interface GearBookingInput {
  start_date: string
  end_date: string
  item_ids: string[]
  kit_ids: string[]
  /** Onderdelen van gekozen kits die bewust niet meegaan ("zonder …"). */
  excluded_item_ids: string[]
  user_id?: string | null
  freelancer_id?: string | null
  external_name?: string | null
  client_id?: string | null
  project_id?: string | null
  note?: string | null
  /** Bevestigd dat het besproken is met de verantwoordelijke(n), als die er zijn. */
  responsible_ack?: boolean
}

/** Wat een verhuis met komende boekingen doet of zou doen. */
export interface GearMoveEffect {
  booking_id: string
  start_date: string
  end_date: string
  action: 'weggehaald' | 'toegevoegd' | 'weghalen' | 'toevoegen'
  reason?: string
  /** Door de API ingevuld: voor wie de boeking is. */
  label?: string
}

/** Wat gear_delete_category teruggeeft; terugsturen om ongedaan te maken. */
export interface GearCategorySnapshot {
  category: GearCategory
  into_id: string | null
  kits: { id: string; sort_order: number }[]
  items: { id: string; sort_order: number }[]
}

export interface GearCategoryRestore {
  category_id: string
  kits: number
  items: number
  /** Namen die intussen elders stonden en dus bleven staan. */
  skipped: string[]
}

export interface GearMoveResult {
  updated: GearMoveEffect[]
  failed: GearMoveEffect[]
}
