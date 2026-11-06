import { hasOpenSection, isAdminUser } from '@/lib/auth-permissions'

// Wat iemand mag in de materiaalplanner, met de sleutels van de module
// Materiaal (src/lib/access-roles.ts). Zelfde regels als gear_can() in de
// database (0071): "open" zoals pré-assist, behalve voor freelancer-accounts.
//
// Dit is voor het scherm en een vroege 403 in de API; de database
// controleert het opnieuw.

type User = Parameters<typeof hasOpenSection>[0]

export interface GearAccess {
  /** Planner en catalogus zien. */
  view: boolean
  /** Boeken; eigen boekingen wijzigen; defect of beperkt melden. */
  book: boolean
  /** Boekingen van iedereen wijzigen of annuleren, ook in het verleden. */
  manageBookings: boolean
  /** Catalogus beheren, herstellen, uit dienst nemen. */
  manageCatalog: boolean
  /** De volgorde van de categorieën slepen: alleen platformbeheerders (admin), niet het niveau Beheren. */
  reorderCategories: boolean
}

const NONE: GearAccess = { view: false, book: false, manageBookings: false, manageCatalog: false, reorderCategories: false }

export function gearAccess(user: User): GearAccess {
  if (!user) return NONE
  if ((user.app_metadata as Record<string, unknown> | undefined)?.freelancer === true) return NONE
  return {
    view:           hasOpenSection(user, 'materiaal'),
    book:           hasOpenSection(user, 'materiaal_reserveren'),
    manageBookings: hasOpenSection(user, 'reservering_verwijderen'),
    manageCatalog:  hasOpenSection(user, 'materiaal_toevoegen'),
    reorderCategories: isAdminUser(user),
  }
}

/**
 * Mag deze gebruiker deze boeking wijzigen of annuleren? Dezelfde regel als
 * gear_check_booking_access() in de database (0072): eigen boeking (gemaakt
 * door of voor jou) zolang ze niet voorbij is, of Beheren voor alles.
 */
export function canChangeBooking(
  booking: { created_by: string | null; booked_for_user_id: string | null; end_date: string },
  userId: string,
  access: GearAccess,
  today: string,
): boolean {
  if (access.manageBookings) return true
  if (!access.book) return false
  const mine = booking.created_by === userId || booking.booked_for_user_id === userId
  return mine && booking.end_date >= today
}
