import { createAdminClient } from '@/lib/supabase/server'
import { bookingWho } from './server'
import type { GearMoveEffect } from './types'

// Bij een verhuis noemen we de geraakte boekingen bij naam: voor wie, en welke
// dagen. Klantnamen via de server, zoals elders in /materiaal.
export async function labelMoveEffects(effects: GearMoveEffect[]): Promise<GearMoveEffect[]> {
  const ids = [...new Set(effects.map(e => e.booking_id))]
  if (!ids.length) return effects
  const admin = createAdminClient()
  const { data: bookings } = await admin.from('gear_bookings').select('id, person_name, client_id').in('id', ids)
  const clientIds = [...new Set((bookings ?? []).map(b => b.client_id).filter((c): c is string => !!c))]
  const { data: clients } = clientIds.length
    ? await admin.from('clients').select('id, name').in('id', clientIds)
    : { data: [] as { id: string; name: string }[] }
  const clientName = new Map((clients ?? []).map(c => [c.id, c.name]))
  const who = new Map((bookings ?? []).map(b => [b.id, bookingWho({ person_name: b.person_name, client_name: b.client_id ? clientName.get(b.client_id) : null })]))
  return effects.map(e => ({ ...e, label: who.get(e.booking_id) ?? 'onbekend' }))
}
