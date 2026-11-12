// Wie welke rij in de planning mag bewerken.
//
// Dit stond als canEditCol in PlanningApp, met één gat dat de launch niet
// mocht halen: wie geen planning_volledig had en geen kolom toegewezen kreeg
// ("Volgens de rol"), mocht álles bewerken. De rol "Bekijken" was dus in de
// praktijk "Bewerken".
//
// De regels, in deze volgorde:
// 1. planning_volledig (of beheer, of een account zonder permissies) → alles.
// 2. Kolom "__none__" → niets.
// 3. Kolom = een contact-id → alleen die rij.
// 4. Kolom = een oude naam of `afdeling|naam` → de rij met die naam, tot een
//    beheerder hem opnieuw toekent.
// 5. Geen kolom → je eigen rij: het Team-contact met het e-mailadres van je
//    login. Geen eigen rij gevonden → alleen kijken.
//
// Dezelfde regels staan in de database, in planning_can_write() uit migratie
// 0090. Dit bestand bepaalt wat het scherm aanbiedt; de database bepaalt wat
// er echt mag. Pas je hier iets aan, pas het daar ook aan.

import { normName } from './planning-config'
import { hasOpenSection, isFreelancerUser } from './auth-permissions'

export const NO_COLUMN = '__none__'

export interface PlanningEditRights {
  editAll: boolean
  // permissions.planning_column, zoals de beheerder hem instelde.
  column: string | null
  // Het Team-contact van de ingelogde gebruiker, gevonden op e-mailadres.
  ownContactId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isContactId(value: string): boolean {
  return UUID.test(value)
}

export function canEditPerson(rights: PlanningEditRights, person: { id: string; emp: string }): boolean {
  if (rights.editAll) return true
  const column = rights.column?.trim() || null
  if (column === NO_COLUMN) return false
  if (column) {
    if (isContactId(column)) return column === person.id
    const naam = column.includes('|') ? column.slice(column.indexOf('|') + 1) : column
    return normName(naam) === normName(person.emp)
  }
  return rights.ownContactId !== null && rights.ownContactId === person.id
}

// Het Team-contact dat bij een login hoort. Op e-mailadres, hoofdletter- en
// spatie-ongevoelig — dezelfde vergelijking als in planning_can_write().
export function ownContactIdFor(
  email: string | null | undefined,
  contacts: { id: string; email: string | null }[],
): string | null {
  const wanted = email?.trim().toLowerCase()
  if (!wanted) return null
  return contacts.find(c => c.email && c.email.trim().toLowerCase() === wanted)?.id ?? null
}

// Mag dit account de planning überhaupt zien? Voor de pagina en voor elke
// route die planningsgegevens teruggeeft. Dezelfde vraag als de leesregel op
// planning_entries in migratie 0090.
//
// Open sectie: een account zonder ingestelde permissies mag, zoals overal in
// de hub. Freelancers nooit — hun account heeft geen permissies en zou anders
// als "open" doorgaan.
export function canReadPlanning(user: Parameters<typeof hasOpenSection>[0]): boolean {
  if (!user) return false
  if (isFreelancerUser(user)) return false
  return hasOpenSection(user, 'planning')
}
