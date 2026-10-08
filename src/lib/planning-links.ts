// Gedeelde vorm van een persoonlijke planningslink, en het opzoeken ervan.
//
// Zie supabase/migrations/0052_planning_links.sql voor waarom dit een token is
// en geen account.

import { createAdminClient } from '@/lib/supabase/server'

export interface PlanningLink {
  token: string
  contact_id: string
  created_by: string | null
  created_at: string
  revoked_at: string | null
  last_seen_at: string | null
}

// Wat de beheerder te zien krijgt in de lijst. Het token zit er bewust bij —
// een link die je niet kan terugvinden wordt in de praktijk een tweede link.
export type PlanningLinkRow = PlanningLink

// Losse functie, want elke route die een token aanneemt moet hem op exact
// dezelfde manier controleren: bestaat hij, en is hij niet ingetrokken.
//
// Geeft null bij alles wat niet klopt, zonder onderscheid. Een bezoeker hoeft
// niet te weten of zijn link verlopen is of nooit bestaan heeft.
export async function resolvePlanningLink(token: unknown): Promise<PlanningLink | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_links')
    .select('token, contact_id, created_by, created_at, revoked_at, last_seen_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !data || data.revoked_at) return null
  return data as PlanningLink
}

// Bijhouden wanneer een link voor het laatst gebruikt is, zodat een beheerder
// kan zien welke links dood hout zijn. Niet awaiten door de aanroeper: dit mag
// het antwoord niet vertragen en een mislukking is onbelangrijk.
export function touchPlanningLink(token: string): void {
  createAdminClient()
    .from('planning_links')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token', token)
    .then(undefined, () => { /* niet belangrijk genoeg om iets mee te doen */ })
}
