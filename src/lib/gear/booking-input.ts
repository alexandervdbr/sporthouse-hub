import { isISODate } from './dates'
import type { GearBookingInput } from './types'

// Wat een formulier als boeking instuurt, omzetten naar de argumenten van
// gear_create_booking / gear_update_booking. Alleen de vorm wordt hier
// gecontroleerd; de regels (overlap, voor wie, defect, rechten) bewaakt de
// database zelf.

export type BookingArgs = {
  p_start_date: string
  p_end_date: string
  p_item_ids: string[]
  p_kit_ids: string[]
  p_excluded_item_ids: string[]
  p_user_id: string | null
  p_freelancer_id: string | null
  p_external_name: string | null
  p_client_id: string | null
  p_project_id: string | null
  p_note: string | null
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const ids = (v: unknown): string[] | null =>
  v === undefined || v === null ? [] : Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : null

export function parseBookingInput(body: unknown): { args: BookingArgs } | { error: string } {
  const b = (body ?? {}) as Partial<Record<keyof GearBookingInput, unknown>>
  const start = text(b.start_date)
  const end = text(b.end_date)
  if (!start || !end || !isISODate(start) || !isISODate(end)) return { error: 'Kies een begin- en einddatum.' }
  const itemIds = ids(b.item_ids), kitIds = ids(b.kit_ids), excluded = ids(b.excluded_item_ids)
  if (!itemIds || !kitIds || !excluded) return { error: 'Ongeldige lijst met materiaal.' }
  if (itemIds.length + kitIds.length === 0) return { error: 'Kies minstens één stuk materiaal of een kit.' }
  return {
    args: {
      p_start_date: start,
      p_end_date: end,
      p_item_ids: itemIds,
      p_kit_ids: kitIds,
      p_excluded_item_ids: excluded,
      p_user_id: text(b.user_id),
      p_freelancer_id: text(b.freelancer_id),
      p_external_name: text(b.external_name),
      p_client_id: text(b.client_id),
      p_project_id: text(b.project_id),
      p_note: text(b.note),
    },
  }
}
