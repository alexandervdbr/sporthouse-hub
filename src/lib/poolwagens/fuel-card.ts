import type { PoolReservation } from './types'

// De tankkaart van een poolwagen (0087). Het volledige kaartnummer en de
// pincode staan in een afgeschermde tabel; de wagen zelf draagt alleen de
// laatste vier tekens (fuel_card_last4), die overal naast de nummerplaat
// staan. De pincode krijgt alleen wie op dat moment met de wagen onderweg is,
// en beheer: dat beslist pool_fuel_card_pin in de database. canSeePin
// hieronder volgt dezelfde regel, alleen om te weten of de knop er staat.

/** Hoe lang de pincode zichtbaar blijft na "Toon pincode". */
export const PIN_VISIBLE_MS = 30_000

export const PIN_TEXT = 'De pincode bestaat uit 4 tot 8 cijfers.'
export const CARD_NUMBER_TEXT = 'Het kaartnummer telt minstens 4 cijfers of letters (hoogstens 40 tekens).'

export interface FuelCardInput {
  /** Het volledige nummer, of null om het te wissen. */
  card_number: string | null
  /** Een nieuwe pincode, of null om de bestaande te laten staan. */
  pin: string | null
  /** De bestaande pincode wissen. */
  clear_pin: boolean
}

/** Wat het beheerformulier instuurt; dezelfde regels als pool_set_fuel_card. */
export function parseFuelCardInput(body: unknown): { input: FuelCardInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const number = typeof b.card_number === 'string' ? b.card_number.trim() : ''
  const pin = typeof b.pin === 'string' ? b.pin.trim() : ''
  if (b.clear_pin !== undefined && typeof b.clear_pin !== 'boolean') return { error: 'Ongeldig verzoek.' }
  const clear = b.clear_pin === true

  if (number && (number.replace(/[^0-9A-Za-z]/g, '').length < 4 || number.length > 40)) return { error: CARD_NUMBER_TEXT }
  if (pin && !/^[0-9]{4,8}$/.test(pin)) return { error: PIN_TEXT }
  if (pin && clear) return { error: 'Geef een nieuwe pincode of wis ze, niet allebei.' }
  return { input: { card_number: number || null, pin: pin || null, clear_pin: clear } }
}

/** Wat er na het opslaan van een kaartnummer naast de nummerplaat komt. */
export function cardLast4(number: string | null): string | null {
  const clean = (number ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return clean ? clean.slice(-4) : null
}

/**
 * Is er iets te bewaren voor de tankkaart? Een gewijzigd nummer, een nieuwe
 * pincode, of de pincode wissen.
 */
export function fuelCardChanged(saved: { card_number: string | null }, form: { card_number: string; pin: string; clear_pin: boolean }): boolean {
  return (form.card_number.trim() || null) !== (saved.card_number ?? null) || !!form.pin.trim() || form.clear_pin
}

/**
 * Staat de knop "Toon pincode" bij deze rit? Tijdens de rit (vertrokken, nog
 * niet aangekomen), voor wie rijdt of voor beheer — zoals pool_fuel_card_pin.
 */
export function canSeePin(r: Pick<PoolReservation, 'user_id' | 'departed_at' | 'arrived_at'>, userId: string, manage: boolean): boolean {
  return !!r.departed_at && !r.arrived_at && (r.user_id === userId || manage)
}

/**
 * Hoe de kaart er na het opslaan uitziet in het overzicht van beheer (zonder
 * opnieuw op te halen): null als er geen nummer en geen pincode meer is.
 */
export function nextFuelCard(
  carId: string,
  prev: { card_number: string | null; has_pin: boolean } | null,
  input: FuelCardInput,
): { car_id: string; card_number: string | null; has_pin: boolean } | null {
  const has_pin = input.clear_pin ? false : input.pin ? true : !!prev?.has_pin
  if (!input.card_number && !has_pin) return null
  return { car_id: carId, card_number: input.card_number, has_pin }
}
