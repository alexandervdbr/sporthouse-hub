import type { UserClient } from './server'
import { MAX_PHOTOS } from './damage-input'

// Mag deze gebruiker foto's bij deze melding zetten? Wie meldde, of beheer —
// dezelfde regel als pool_add_damage_photo (0078), hier vooraf zodat er geen
// Drive-sessie geopend wordt voor iets dat de database straks weigert.
export async function photoTarget(supabase: UserClient, reportId: string, userId: string, manage: boolean) {
  const { data, error } = await supabase
    .from('pool_car_damage_reports')
    .select('id, reported_by, pool_car_damage_photos(id)')
    .eq('id', reportId).maybeSingle()
  if (error || !data) return { error: new Response('Melding niet gevonden.', { status: 404 }) } as const
  if (!manage && data.reported_by !== userId) {
    return { error: new Response('Alleen wie de schade meldde, kan er foto’s bij zetten.', { status: 403 }) } as const
  }
  if ((data.pool_car_damage_photos?.length ?? 0) >= MAX_PHOTOS) {
    return { error: new Response(`Hoogstens ${MAX_PHOTOS} foto’s per melding.`, { status: 400 }) } as const
  }
  return { report: data } as const
}
