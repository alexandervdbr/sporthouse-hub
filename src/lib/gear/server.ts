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
  table: 'gear_categories' | 'gear_units' | 'gear_unit_contents',
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
