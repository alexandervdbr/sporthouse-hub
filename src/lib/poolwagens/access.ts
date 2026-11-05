import { hasSection, isFreelancerUser } from '@/lib/auth-permissions'

// Wat iemand mag bij de poolwagens, met de sleutels van de module Poolwagens
// (src/lib/access-roles.ts). Zelfde regels als poolwagen_can() in de database
// (0076): deny-by-default, Beheer mag alles, freelancers nooit iets.
//
// Dit is voor het scherm en een vroege 403 in de API; de database
// controleert het opnieuw.

type User = Parameters<typeof hasSection>[0]

export interface PoolwagenAccess {
  /** Planning bekijken, reserveren, ritten registreren, schade melden. */
  use: boolean
  /** Wagens beheren, schadestatus, blokkades, reservaties van anderen. */
  manage: boolean
}

const NONE: PoolwagenAccess = { use: false, manage: false }

export function poolwagenAccess(user: User): PoolwagenAccess {
  if (!user || isFreelancerUser(user)) return NONE
  // Precies zoals de database: elke sleutel apart. Het niveau Beheren bevat
  // Gebruiken (ladder in access-roles.ts), dus wie beheert, gebruikt ook.
  return { use: hasSection(user, 'poolwagens'), manage: hasSection(user, 'poolwagens_beheren') }
}
