import type { UnitStatus } from './status'

// Vormen zoals de API van /materiaal ze teruggeeft.

export interface GearCategory {
  id: string
  name: string
  color: string
  sort_order: number
}

export interface GearUnitContent {
  id: string
  unit_id: string
  label: string
  quantity: number
  note: string | null
  sort_order: number
}

export interface GearUnit {
  id: string
  category_id: string
  name: string
  quantity: number
  sort_order: number
  label_color: string | null
  nd_size: string | null
  warning: string | null
  notes: string | null
  status: UnitStatus
  status_note: string | null
  home_client_id: string | null
  contents: GearUnitContent[]
}

export interface GearClientRef {
  id: string
  name: string
  color: string | null
}

export interface GearCatalog {
  categories: GearCategory[]
  units: GearUnit[]
  /** Alleen de klanten die als vaste houder voorkomen, met naam en kleur. */
  holders: GearClientRef[]
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

export interface GearUnitBooking {
  id: string
  start_date: string
  end_date: string
  person_name: string | null
  client: GearClientRef | null
  note: string | null
  created_by_name: string
  cancelled_at: string | null
}

export interface GearUnitHistory {
  status: GearStatusLogEntry[]
  bookings: GearUnitBooking[]
}

export interface GearBooking {
  id: string
  start_date: string
  end_date: string
  unit_ids: string[]
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
  unit_ids: string[]
  user_id?: string | null
  freelancer_id?: string | null
  external_name?: string | null
  client_id?: string | null
  project_id?: string | null
  note?: string | null
}
