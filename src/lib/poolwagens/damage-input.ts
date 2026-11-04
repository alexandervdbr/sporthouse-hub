import { isEmail } from './mail'
import type { DamageSeverity, DamageStatus } from './types'

// Invoer voor schademeldingen en de ontvangers van de schademail. Alleen de
// vorm; de regels bewaakt de database (0078).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SEVERITY_LABEL: Record<DamageSeverity, string> = { licht: 'Licht', ernstig: 'Ernstig' }
export const STATUS_LABEL: Record<DamageStatus, string> = {
  gemeld: 'Gemeld',
  in_behandeling: 'In behandeling',
  hersteld: 'Hersteld',
}
export const DAMAGE_STATUSES: DamageStatus[] = ['gemeld', 'in_behandeling', 'hersteld']

export function isDamageStatus(v: unknown): v is DamageStatus {
  return typeof v === 'string' && (DAMAGE_STATUSES as string[]).includes(v)
}

export const MAX_DESCRIPTION = 2000
export const MAX_PHOTOS = 10

export interface DamageArgs {
  p_car_id: string
  p_reservation_id: string | null
  p_description: string
  p_severity: DamageSeverity
}

export function parseDamageInput(body: unknown): { args: DamageArgs } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.car_id !== 'string' || !UUID_RE.test(b.car_id)) return { error: 'Kies een wagen.' }
  let reservation: string | null = null
  if (b.reservation_id !== undefined && b.reservation_id !== null && b.reservation_id !== '') {
    if (typeof b.reservation_id !== 'string' || !UUID_RE.test(b.reservation_id)) return { error: 'Ongeldige rit.' }
    reservation = b.reservation_id
  }
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  if (!description) return { error: 'Beschrijf de schade.' }
  if (description.length > MAX_DESCRIPTION) return { error: `De omschrijving is hoogstens ${MAX_DESCRIPTION} tekens.` }
  if (b.severity !== 'licht' && b.severity !== 'ernstig') return { error: 'Kies de ernst: licht of ernstig.' }
  return { args: { p_car_id: b.car_id, p_reservation_id: reservation, p_description: description, p_severity: b.severity } }
}

/**
 * Ontvangers uit een tekstveld (komma's, puntkomma's, spaties of regels) of
 * een lijst: in kleine letters, zonder dubbels. Eén ongeldig adres = fout,
 * met het adres erbij.
 */
export function parseRecipients(input: unknown): { list: string[] } | { error: string } {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,;]+/) : null
  if (!raw || raw.some(x => typeof x !== 'string')) return { error: 'Ongeldige lijst ontvangers.' }
  const list = [...new Set((raw as string[]).map(x => x.trim().toLowerCase()).filter(Boolean))].sort()
  const bad = list.find(x => !isEmail(x))
  if (bad) return { error: `Geen geldig e-mailadres: ${bad}` }
  if (list.length > 20) return { error: 'Hoogstens 20 ontvangers.' }
  return { list }
}
