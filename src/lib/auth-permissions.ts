// De rechtencontroles van de app. Geen server-afhankelijkheden, dus bruikbaar
// in server- en clientcode.
//
// Admin is wie een rol met 'beheer' heeft — niets anders. Er stond hier
// vroeger een hardcoded lijst met e-mailadressen die altijd admin waren, maar
// de database (RLS) kende die niet, waardoor app en database het oneens konden
// zijn over wie admin was. Raakt iedereen 'beheer' kwijt, zet het dan terug
// via het Supabase-dashboard (app_metadata van de gebruiker).

type PermissionUser = {
  email?: string | null
  app_metadata?: { permissions?: { sections?: string[]; clients?: string[] } } & Record<string, unknown>
} | null | undefined

// Freelancer accounts may only reach /api/portal/* and /api/auth/*. The proxy
// enforces that for every route at once; a route that the proxy deliberately
// skips has to ask here itself.
export function isFreelancerUser(user: PermissionUser): boolean {
  return user?.app_metadata?.freelancer === true
}

// Sleutels die een andere sleutel insluiten, omdat er later een lager niveau
// onder een bestaande sleutel is geschoven. 'freelancers' was het enige
// niveau ("beheren") tot "bekijken" erbij kwam als 'freelancers_bekijken'.
// Wie al 'freelancers' had, mag dus ook bekijken — ook als zijn sleutellijst
// nog nooit opnieuw is berekend sinds die wijziging. Zonder deze regel zou
// zo iemand na de deploy de zijbalk en de pagina kwijt zijn.
//
// Alleen toevoegen, nooit weghalen: dit mag niemand ooit rechten kosten. De
// SQL-kant doet hetzelfde door beide sleutels te aanvaarden (0092).
export const IMPLIED_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  freelancers: ['freelancers_bekijken'],
}

export function withImpliedSections(sections: readonly string[]): string[] {
  const out = new Set(sections)
  for (const s of sections) for (const extra of IMPLIED_SECTIONS[s] ?? []) out.add(extra)
  return [...out]
}

export function getSections(user: PermissionUser): string[] {
  return withImpliedSections(user?.app_metadata?.permissions?.sections ?? [])
}

export function isAdminUser(user: PermissionUser): boolean {
  return getSections(user).includes('beheer')
}

export function hasSection(user: PermissionUser, section: string): boolean {
  return isAdminUser(user) || getSections(user).includes(section)
}

// Dezelfde vraag als hasSection, maar met de losse uitkomst voor een account
// waarvoor nooit permissies zijn ingesteld: dat mag alles. De TS-tegenhanger
// van user_has_open_section() uit migratie 0032, letterlijk dezelfde drie
// takken in dezelfde volgorde.
//
// Twee varianten naast elkaar is geen slordigheid. hasSection weigert bij
// twijfel, wat klopt voor Wachtwoorden — daar is "we hebben het nog niet
// ingesteld" geen reden om iemand binnen te laten. Pré-assist is het
// omgekeerde geval: een interne inzamelbak waar de pagina, de RLS en het
// admin-paneel alle drie al "niets ingesteld = geen beperking" aanhouden.
// Dezelfde functie voor beide zou de ene feature openzetten of de andere
// dichtgooien, dus staat het verschil hier benoemd in plaats van per
// aanroep opnieuw bedacht.
export function hasOpenSection(user: PermissionUser, section: string): boolean {
  if (isAdminUser(user)) return true
  if (!user?.app_metadata?.permissions) return true
  return getSections(user).includes(section)
}

// Single source of truth for "can this user touch this specific client's
// data" — same semantics as the DB-level user_has_client_access() (see
// supabase/migrations/0023_client_access_rls_foundation.sql), for the many
// routes that use the admin/service-role client and so aren't covered by
// RLS at all. Admin -> full access; no permissions object configured ->
// full access; permissions.clients empty/missing -> full access (no
// restriction set); otherwise -> allow-list membership.
export function hasClientAccess(user: PermissionUser, clientId: string): boolean {
  if (isAdminUser(user)) return true
  const perms = user?.app_metadata?.permissions
  if (!perms) return true
  const allowedIds = perms.clients ?? []
  if (allowedIds.length === 0) return true
  return allowedIds.includes(clientId)
}
