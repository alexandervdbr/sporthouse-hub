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
  /** Met wie je het bespreekt; null als er niemand ingevuld is. */
  contact?: string | null
  /** Kleur van de klant; null bij een collega of een klant zonder kleur. */
  color?: string | null
}

/** De naam van een verantwoordelijke, of null als er geen is. */
export function responsibleName(r: GearResponsible, clients: Map<string, GearClientRef>): string | null {
  if (r.responsible_client_id) return clients.get(r.responsible_client_id)?.name ?? 'onbekende klant'
  if (r.responsible_user_id) return r.responsible_name ?? 'onbekende collega'
  // Account verwijderd: het id is weg, de naamkopie bleef staan.
  if (r.responsible_name) return `${r.responsible_name} (account verwijderd)`
  return null
}

/** De verantwoordelijke van een kit of item zelf, met contactpersoon en kleur. */
export function ownResponsible(r: GearResponsible, clients: Map<string, GearClientRef>, viaKit: string | null = null): EffectiveResponsible | null {
  const name = responsibleName(r, clients)
  if (!name) return null
  return {
    name, viaKit,
    contact: r.contact_name?.trim() || null,
    color: r.responsible_client_id ? clients.get(r.responsible_client_id)?.color ?? null : null,
  }
}

/** Eigen verantwoordelijke van het item, anders die van zijn kit. */
export function effectiveResponsible(
  item: GearResponsible,
  kit: GearKit | null,
  clients: Map<string, GearClientRef>,
): EffectiveResponsible | null {
  return ownResponsible(item, clients) ?? (kit ? ownResponsible(kit, clients, kit.name) : null)
}

/** "Jan Peeters · Sporting Hasselt", of alleen de verantwoordelijke zonder contactpersoon. */
export function responsibleBand(r: EffectiveResponsible): string {
  return r.contact && r.contact !== r.name ? `${r.contact} · ${r.name}` : r.name
}

/** Met wie je het bespreekt: de contactpersoon, anders de verantwoordelijke zelf. */
export function discussWith(r: EffectiveResponsible): string {
  return r.contact || r.name
}

/** "Dit materiaal valt onder Jan Peeters (Sporting Hasselt). Bespreek dit eerst." */
export function responsibleWarning(r: EffectiveResponsible): string {
  const who = r.contact && r.contact !== r.name ? `${r.contact} (${r.name})` : r.name
  return `Dit materiaal valt onder ${who}. Bespreek dit eerst.`
}

/** "Verantwoordelijke: Sporting Hasselt" (+ "via kit …"). */
export function responsibleLabel(r: EffectiveResponsible): string {
  return `Verantwoordelijke: ${r.name}${r.viaKit ? ` (via kit ${r.viaKit})` : ''}`
}
