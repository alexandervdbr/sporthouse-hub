// De oude materiaalplanner (/equipment) staat sinds de livegang van de nieuwe
// (/materiaal) "in de koelkast": de pagina's sturen door naar /materiaal
// (next.config.mjs) en zijn API's nemen geen wijzigingen meer aan
// (src/middleware.ts). Lezen mag nog; de code, de tabellen en de gegevens
// blijven staan. Ze echt weghalen is een aparte beslissing.
//
// Tabellen achter deze routes: equipment, equipment_projects,
// equipment_reservations, day_projects, external_rentals.

const LEGACY_API = /^\/api\/(equipment|equipment-projects|reservations|day-projects|external-rentals)(\/|$)/

export const LEGACY_CLOSED_TEXT = 'De oude materiaalplanner is gesloten. Gebruik /materiaal.'

/** Een schrijfverzoek naar een API van de oude materiaalplanner? */
export function isLegacyEquipmentWrite(method: string, pathname: string): boolean {
  const m = method.toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && LEGACY_API.test(pathname)
}
