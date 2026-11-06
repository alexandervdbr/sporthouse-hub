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

/**
 * Contactpersoon uit een formulier: een collega (id; de naam vult de database
 * zelf in) of, zonder account, een vrije naam.
 */
export function contactFields(body: Record<string, unknown>):
  | { contact_user_id: string | null; contact_name: string | null }
  | null {
  if (!('contact_user_id' in body) && !('contact_name' in body)) return null
  const user = optionalText(body.contact_user_id)
  return { contact_user_id: user, contact_name: user ? null : optionalText(body.contact_name) }
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

const HAS_RESPONSIBLE = 'responsible_client_id.not.is.null,responsible_user_id.not.is.null'

/**
 * Valt iets van deze boeking onder een verantwoordelijke? Dan moet het
 * formulier bevestigen dat het besproken is (responsible_ack). Zelfde vraag
 * als het formulier stelt: de gekozen kits, de onderdelen die meegaan, en de
 * losse items (met de verantwoordelijke van hun kit).
 */
export async function needsResponsibleAck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { p_item_ids: string[]; p_kit_ids: string[]; p_excluded_item_ids: string[] },
): Promise<boolean> {
  const { data: members } = await supabase.from('gear_kit_members').select('kit_id, item_id').is('removed_at', null)
    .or(`kit_id.in.(${args.p_kit_ids.join(',') || '00000000-0000-0000-0000-000000000000'}),item_id.in.(${args.p_item_ids.join(',') || '00000000-0000-0000-0000-000000000000'})`)
  const excluded = new Set(args.p_excluded_item_ids)
  const kitIds = [...new Set([...args.p_kit_ids, ...(members ?? []).filter(m => args.p_item_ids.includes(m.item_id)).map(m => m.kit_id)])]
  const itemIds = [...new Set([...args.p_item_ids, ...(members ?? []).filter(m => args.p_kit_ids.includes(m.kit_id) && !excluded.has(m.item_id)).map(m => m.item_id)])]
  const [kits, items] = await Promise.all([
    kitIds.length ? supabase.from('gear_kits').select('id').in('id', kitIds).or(HAS_RESPONSIBLE).limit(1) : Promise.resolve({ data: [] }),
    itemIds.length ? supabase.from('gear_items').select('id').in('id', itemIds).or(HAS_RESPONSIBLE).limit(1) : Promise.resolve({ data: [] }),
  ])
  return (kits.data?.length ?? 0) + (items.data?.length ?? 0) > 0
}

export const RESPONSIBLE_ACK_TEXT = 'Dit materiaal valt onder een verantwoordelijke. Bevestig dat je het besproken hebt.'
