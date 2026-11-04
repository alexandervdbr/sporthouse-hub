import { createClient } from '@/lib/supabase/server'
import { dbErrorStatus, dbErrorText, type DbError } from '@/lib/gear/db-errors'
import { poolwagenAccess, type PoolwagenAccess } from './access'

// Gedeeld door de routes onder /api/poolwagens. Zelfde opzet als
// src/lib/gear/server.ts: de client van de ingelogde gebruiker, dus RLS en de
// functies in de database beslissen mee. De controle hier geeft alleen
// sneller een duidelijke 403.

export { optionalText } from '@/lib/gear/server'

export type UserClient = Awaited<ReturnType<typeof createClient>>

export async function requirePoolwagens(level: keyof PoolwagenAccess) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Niet ingelogd', { status: 401 }) } as const
  const access = poolwagenAccess(user)
  if (!access[level]) return { error: new Response('Je hebt hier geen rechten voor.', { status: 403 }) } as const
  return { supabase, user, access } as const
}

// Meldingen van Postgres zelf (een constraint die als vangnet afgaat, bv. bij
// twee gelijktijdige klikken) in gewone taal. Onze eigen functies geven al
// Nederlandse meldingen; die gaan ongewijzigd door (dbErrorText).
const CONSTRAINT_TEXT: Record<string, string> = {
  pool_car_reservations_no_overlap: 'Deze wagen is in die periode al gereserveerd.',
  pool_car_reservations_one_open_trip: 'De wagen is nog niet terug van een vorige rit.',
  pool_car_reservations_arrival_after_departure: 'De kilometerstand en het tijdstip bij aankomst moeten minstens die bij vertrek zijn.',
  pool_cars_license_plate_key: 'Er bestaat al een wagen met deze nummerplaat.',
}

export function poolDbErrorText(err: DbError): string {
  const msg = err.message ?? ''
  for (const [name, text] of Object.entries(CONSTRAINT_TEXT)) if (msg.includes(name)) return text
  return dbErrorText(err)
}

export function dbErrorResponse(err: DbError) {
  return new Response(poolDbErrorText(err), { status: dbErrorStatus(err) })
}

/** De JSON van een verzoek, of null als die ontbreekt of kapot is. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}
