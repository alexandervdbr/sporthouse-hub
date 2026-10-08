// Contractvorm van een Team-contact, en de vraag of iemand nu meedraait.
//
// Gedeeld tussen de routes, de Team-pagina en de planning, zodat "actief"
// overal hetzelfde betekent. Zie supabase/migrations/0051_contacts_employment.sql
// voor waarom dit niet op het account zit maar op de persoon.

export const EMPLOYMENT_TYPES = ['vast', 'stagiair', 'student'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  vast:     'Vast',
  stagiair: 'Stagiair',
  student:  'Student',
}

// Iemand telt als actief tot en met zijn einddatum. Geen datum = onbepaald.
//
// De vergelijking gebeurt op kalenderdagen, niet op tijdstippen: `active_until`
// is een DATE, en iemand die vandaag zijn laatste dag heeft werkt vandaag nog.
export function isActiveContact(c: { active_until?: string | null }, today = new Date()): boolean {
  if (!c.active_until) return true
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return c.active_until >= t
}
