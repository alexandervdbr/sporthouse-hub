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
}

export const CAR_COLUMNS =
  'id, name, license_plate, make_model, current_km, manual_block, manual_block_note, archived_at, created_at'
