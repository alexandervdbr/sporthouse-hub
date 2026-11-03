import { createClient } from '@/lib/supabase/server'
import { gearAccess, type GearAccess } from './access'
import { dbErrorStatus, dbErrorText, type DbError } from './db-errors'

// Gedeeld door de routes onder /api/materiaal.
//
// De routes werken met de client van de ingelogde gebruiker, niet met de
// service-sleutel: RLS en de functies in de database (0071, 0072) beslissen
// dus mee. De controle hier geeft alleen sneller een duidelijke 403.

type Level = keyof GearAccess

export async function requireGear(level: Level) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Niet ingelogd', { status: 401 }) } as const
  const access = gearAccess(user)
  if (!access[level]) return { error: new Response('Je hebt hier geen rechten voor.', { status: 403 }) } as const
  return { supabase, user, access } as const
}

export function dbErrorResponse(err: DbError) {
  return new Response(dbErrorText(err), { status: dbErrorStatus(err) })
}

/** Tekst die leeg mag zijn: getrimd, of null. */
export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Volgorde opslaan na slepen: sort_order = positie in de lijst. */
export async function saveOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'gear_categories' | 'gear_items' | 'gear_kits',
  ids: unknown,
) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
    return new Response('Ongeldige volgorde', { status: 400 })
  }
  const results = await Promise.all(
    (ids as string[]).map((id, i) => supabase.from(table).update({ sort_order: i + 1 }).eq('id', id))
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return dbErrorResponse(failed.error)
  return new Response(null, { status: 204 })
}

/** Voor wie een boeking is, als korte tekst ("Bram Kreike · NoStrezz"). */
export function bookingWho(b: { person_name: string | null; client_name?: string | null }): string {
  return [b.person_name, b.client_name].filter(Boolean).join(' · ') || 'onbekend'
}

/** Verantwoordelijke uit een formulier: een klant óf een collega, nooit allebei. */
export function responsibleFields(body: Record<string, unknown>):
  | { fields: { responsible_client_id: string | null; responsible_user_id: string | null } }
  | { error: string }
  | null {
  if (!('responsible_client_id' in body) && !('responsible_user_id' in body)) return null
  const client = optionalText(body.responsible_client_id)
  const user = optionalText(body.responsible_user_id)
  if (client && user) return { error: 'Kies een klant óf een collega als verantwoordelijke.' }
  return { fields: { responsible_client_id: client, responsible_user_id: user } }
}
