// Gedeeld tussen de planner en het beheerpaneel.

export interface EquipmentItem {
  id: string
  name: string
  category: string
  description?: string | null
  is_broken?: boolean
  broken_note?: string | null
  sort_order?: number
  // Materiaal dat vast bij iemand of een project hoort. Anderen kunnen het
  // reserveren, maar in samenspraak met deze verantwoordelijke.
  owner?: string | null
  owner_note?: string | null
}

// Kolomgroep in het raster. Materiaal hangt eraan via de naam.
export interface EquipmentCategory {
  id: string
  name: string
  color: string
  sort_order: number
}

// Vast project waaronder gereserveerd kan worden. show_in_planner laat het
// raster het project tonen in plaats van de persoon, zodat FoS- en De
// Spor-blokken herkenbaar blijven terwijl de naam eronder bewaard blijft.
export interface EquipmentProject {
  id: string
  name: string
  color: string
  show_in_planner: boolean
  sort_order: number
}

export interface Reservation {
  id: string
  equipment_id: string
  reserved_by: string
  created_by?: string | null
  date: string
  pickup_datetime: string | null
  return_datetime: string | null
  project: string | null
  note: string | null
}

export const DEFAULT_OWNER_NOTE = 'Dit materiaal kan gehuurd worden in samenspraak met de verantwoordelijke.'

export const PALETTE = [
  '#3A913F', '#22c55e', '#facc15', '#f59e0b', '#f97316', '#c2410c',
  '#ec4899', '#be185d', '#a855f7', '#6d28d9', '#0ea5e9', '#2563eb',
  '#22d3ee', '#0891b2', '#64748b', '#71717a',
]
