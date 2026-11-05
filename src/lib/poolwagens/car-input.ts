// Wat het beheerformulier als wagen instuurt, omzetten naar een rij voor
// pool_cars. Alleen de vorm wordt hier gecontroleerd; dubbele nummerplaten
// en de rechten bewaakt de database zelf (0076).

export interface CarRow {
  name?: string
  license_plate?: string
  make_model?: string | null
  current_km?: number
  manual_block?: boolean
  manual_block_note?: string | null
  archived_at?: string | null
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const DUPLICATE_NAME_TEXT = 'Er bestaat al een wagen met deze naam.'

/**
 * Heeft een andere actieve wagen al deze naam? Hoofdletters en spaties
 * vooraan of achteraan tellen niet mee, gearchiveerde wagens niet — zoals de
 * unieke index pool_cars_name_active_key (0080).
 */
export function isDuplicateCarName(
  name: string,
  cars: { id: string; name: string; archived_at: string | null }[],
  ignoreId: string | null = null,
): boolean {
  const key = name.trim().toLowerCase()
  return !!key && cars.some(c => !c.archived_at && c.id !== ignoreId && c.name.trim().toLowerCase() === key)
}

/** Nummerplaat zoals ingegeven, in hoofdletters en zonder dubbele spaties. */
export function formatPlate(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Kilometerstand: een geheel getal vanaf 0. Punten en spaties als duizendtal mogen. */
export function parseKm(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.replace(/[\s.]/g, '') : ''
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n <= 2_000_000_000 ? n : null
}

/**
 * Nieuwe wagen (partial = false): naam en nummerplaat verplicht.
 * Wijziging (partial = true): alleen wat meegestuurd is, en dat moet geldig zijn.
 * `now` is het tijdstip voor archived_at bij archiveren.
 */
export function parseCarInput(body: unknown, partial: boolean, now: Date = new Date()): { row: CarRow } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const row: CarRow = {}
  const has = (k: string) => !partial || k in b

  if (has('name')) {
    const name = text(b.name)
    if (!name) return { error: 'Geef de wagen een naam.' }
    row.name = name
  }
  if (has('license_plate')) {
    const plate = text(b.license_plate)
    if (!plate) return { error: 'Vul de nummerplaat in.' }
    row.license_plate = formatPlate(plate)
  }
  if ('make_model' in b) row.make_model = text(b.make_model)
  if (has('current_km')) {
    if (!partial && (b.current_km === undefined || b.current_km === '' || b.current_km === null)) {
      row.current_km = 0
    } else {
      const km = parseKm(b.current_km)
      if (km === null) return { error: 'De kilometerstand is een geheel getal vanaf 0.' }
      row.current_km = km
    }
  }
  if ('manual_block' in b) {
    if (typeof b.manual_block !== 'boolean') return { error: 'Ongeldige beschikbaarheid.' }
    row.manual_block = b.manual_block
    // Weer beschikbaar: de reden hoort er niet meer bij.
    if (!b.manual_block) row.manual_block_note = null
  }
  if ('manual_block_note' in b && row.manual_block !== false) row.manual_block_note = text(b.manual_block_note)
  if ('archived' in b) {
    if (typeof b.archived !== 'boolean') return { error: 'Ongeldige waarde voor archiveren.' }
    row.archived_at = b.archived ? now.toISOString() : null
  }

  if (partial && Object.keys(row).length === 0) return { error: 'Er is niets om te wijzigen.' }
  return { row }
}
