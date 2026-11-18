// Wie de mensen in Team mag zien, los van welke klanten hij ziet.
//
// Het team zijn contactpersonen van de interne klanten (Sporthouse, Friends
// of Sports). De RLS op contacts en clients volgt klanttoegang
// (user_has_client_access, 0024). Een stagiair ziet alleen de klanten die
// voor hem aangevinkt zijn (rol 'chosen', 0065), dus zonder Sporthouse in die
// lijst bleef de Team-pagina leeg en had de planning geen enkele rij — ook
// niet zijn eigen.
//
// Klanttoegang is hier de verkeerde vraag. Wie Team of Planning mag zien,
// moet de collega's zien; de klantfiche van Sporthouse (bestanden,
// wachtwoorden, kalender) blijft daarbuiten, want die loopt niet via hier.
//
// Alleen lezen. Toevoegen, wijzigen en wissen blijven onder de RLS.

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { hasOpenSection } from '@/lib/auth-permissions'

// Freelancers hebben geen account meer (docs/freelancers-overzicht.md), dus
// hier geen aparte blokkade voor hen.
export function canSeeTeam(user: User | null | undefined): boolean {
  if (!user) return false
  return hasOpenSection(user, 'team') || hasOpenSection(user, 'planning')
}

// De contacten onder alle interne klanten. Met Team- of Planningrechten via
// de service-rol, anders zoals voorheen met de rechten van de gebruiker zelf
// (een kalender- of briefingscherm dat ook collega's toont verliest dus
// niets, maar krijgt er ook niets bij).
export async function readTeamContacts<T>(
  supabase: SupabaseClient,
  user: User,
  columns: string,
): Promise<{ data: T[]; error: string | null }> {
  const db = canSeeTeam(user) ? createAdminClient() : supabase

  const { data: internClients, error: cErr } = await db
    .from('clients')
    .select('id')
    .eq('category', 'intern')
  if (cErr) return { data: [], error: cErr.message }

  const ids = (internClients ?? []).map((c: { id: string }) => c.id)
  if (ids.length === 0) return { data: [], error: null }

  const { data, error } = await db
    .from('contacts')
    .select(columns)
    .in('client_id', ids)
    .order('name')
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as T[], error: null }
}
