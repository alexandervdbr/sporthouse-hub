import type { GearClientRef, GearKit, GearResponsible } from './types'

// De verantwoordelijke van materiaal: een klant (Sporting Hasselt, Friends
// of Sports) of een collega. Het materiaal blijft te boeken, maar in
// samenspraak met die verantwoordelijke. Een item kan er zelf een hebben;
// anders erft het die van zijn kit.

export const RESPONSIBLE_NOTICE = 'Dit materiaal kan gehuurd worden in samenspraak met de verantwoordelijke.'

export interface EffectiveResponsible {
  name: string
  /** Gezet als de verantwoordelijke van de kit komt, niet van het item zelf. */
  viaKit: string | null
}

/** De naam van een verantwoordelijke, of null als er geen is. */
export function responsibleName(r: GearResponsible, clients: Map<string, GearClientRef>): string | null {
  if (r.responsible_client_id) return clients.get(r.responsible_client_id)?.name ?? 'onbekende klant'
  if (r.responsible_user_id) return r.responsible_name ?? 'onbekende collega'
  // Account verwijderd: het id is weg, de naamkopie bleef staan.
  if (r.responsible_name) return `${r.responsible_name} (account verwijderd)`
  return null
}

/** Eigen verantwoordelijke van het item, anders die van zijn kit. */
export function effectiveResponsible(
  item: GearResponsible,
  kit: GearKit | null,
  clients: Map<string, GearClientRef>,
): EffectiveResponsible | null {
  const own = responsibleName(item, clients)
  if (own) return { name: own, viaKit: null }
  const fromKit = kit ? responsibleName(kit, clients) : null
  return fromKit ? { name: fromKit, viaKit: kit!.name } : null
}

/** "Verantwoordelijke: Sporting Hasselt" (+ "via kit …"). */
export function responsibleLabel(r: EffectiveResponsible): string {
  return `Verantwoordelijke: ${r.name}${r.viaKit ? ` (via kit ${r.viaKit})` : ''}`
}
