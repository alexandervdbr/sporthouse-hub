import { hasSection } from '@/lib/auth-permissions'

// Wie wat mag in de freelancertool. Eén plek, voor pagina's, API-routes en de
// browser — er stonden vroeger zeven eigen kopieën in de routes, en drie
// daarvan lieten alleen admins toe terwijl de knoppen voor iedereen met het
// recht zichtbaar waren.
//
// Twee niveaus boven "geen" (src/lib/access-roles.ts):
//   bekijken → 'freelancers_bekijken'
//   beheren  → 'freelancers' (de sleutel die vóór "bekijken" al bestond)
// 'freelancers' sluit 'freelancers_bekijken' in (IMPLIED_SECTIONS), dus wie
// beheert kan altijd ook bekijken.
//
// Deny-by-default: een account zonder permissions-object krijgt niets. Dat
// is bewust anders dan hasOpenSection — hier staan contactgegevens, tarieven
// en beoordelingen van externe mensen.

export type FreelancerLevel = 'geen' | 'bekijken' | 'beheren'

type User = Parameters<typeof hasSection>[0]

export function freelancerLevel(user: User): FreelancerLevel {
  if (hasSection(user, 'freelancers')) return 'beheren'
  if (hasSection(user, 'freelancers_bekijken')) return 'bekijken'
  return 'geen'
}

export function canViewFreelancers(user: User): boolean {
  return freelancerLevel(user) !== 'geen'
}

export function canManageFreelancers(user: User): boolean {
  return freelancerLevel(user) === 'beheren'
}

export function meetsLevel(user: User, needed: Exclude<FreelancerLevel, 'geen'>): boolean {
  return needed === 'beheren' ? canManageFreelancers(user) : canViewFreelancers(user)
}
