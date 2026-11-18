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

// Wat er op het Team-contact moet veranderen als een account een rol met een
// einddatum heeft (de stagiair).
//
// Zonder dit stond een nieuwe stagiair onder "Vast team": de uitnodiging
// maakte het Team-contact aan met naam en e-mail, en de contractvorm viel
// terug op de default 'vast'. De vervaldatum zat alleen op zijn login.
//
// Aanvullen, niet overschrijven — zoals de uitnodiging dat ook doet voor naam
// en telefoon. De einddatum in Team is de bron (zie 0051), dus:
//   * contractvorm: 'vast' (of leeg) wordt 'stagiair'; een student blijft
//     student.
//   * einddatum: leeg wordt de vervaldatum van het account. Stond hij gelijk
//     aan de vórige vervaldatum, dan schuift hij mee (de stage wordt
//     verlengd). Week hij al af, dan heeft iemand hem in Team bewust anders
//     gezet en blijft hij staan.
export function employmentPatchForAccount(
  contact: { employment_type?: string | null; active_until?: string | null } | null,
  account: { requiresEndDate: boolean; expiresAt: string | null | undefined; previousExpiresAt?: string | null },
): { employment_type?: EmploymentType; active_until?: string } {
  const end = toDay(account.expiresAt)
  if (!account.requiresEndDate || !end) return {}

  const patch: { employment_type?: EmploymentType; active_until?: string } = {}
  const type = contact?.employment_type ?? 'vast'
  if (type === 'vast') patch.employment_type = 'stagiair'

  const current = contact?.active_until ?? null
  if (!current) patch.active_until = end
  else if (current !== end && current === toDay(account.previousExpiresAt)) patch.active_until = end
  return patch
}

// `expires_at` op het account kan een datum of een volledig tijdstip zijn;
// `active_until` is een DATE.
function toDay(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}
