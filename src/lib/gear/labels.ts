// Wat er op een balk in het raster en in meldingen staat.

const PERSON_COLORS = [
  '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f97316', '#22d3ee', '#a3e635', '#fb923c', '#34d399', '#e879f9', '#60a5fa',
]

/** Vaste kleur per naam, zodat iemand overal dezelfde kleur heeft. */
export function personColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return PERSON_COLORS[Math.abs(h) % PERSON_COLORS.length]
}

/**
 * Korte namen voor in het raster: de voornaam, tenzij twee mensen dezelfde
 * voornaam hebben — dan komt de eerste letter van de achternaam erbij.
 * Dezelfde regel als de planning (TeamMonthGrid).
 */
export function shortNames(fullNames: string[]): Map<string, string> {
  const firstCounts = new Map<string, number>()
  for (const n of fullNames) {
    const first = n.trim().split(/\s+/)[0] ?? n
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const n of fullNames) {
    const parts = n.trim().split(/\s+/)
    const first = parts[0] ?? n
    out.set(n, (firstCounts.get(first) ?? 0) > 1 && parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first)
  }
  return out
}

export interface BarLabelInput {
  /** Al ingekorte naam van de persoon, als er een is. */
  personName?: string | null
  clientName?: string | null
  clientColor?: string | null
}

export interface BarLabel {
  text: string
  color: string
}

const FALLBACK_COLOR = '#71717a'

/**
 * Persoon alleen → de persoon in zijn kleur. Klant alleen → de klant in de
 * kleur van de klant. Allebei → "Bram · NoStrezz" in de kleur van de klant,
 * zodat klantblokken herkenbaar blijven, zoals FoS dat was in de spreadsheet.
 */
export function barLabel({ personName, clientName, clientColor }: BarLabelInput): BarLabel {
  const person = personName?.trim() || null
  const client = clientName?.trim() || null
  if (person && client) return { text: `${person} · ${client}`, color: clientColor || personColor(person) }
  if (client) return { text: client, color: clientColor || FALLBACK_COLOR }
  if (person) return { text: person, color: personColor(person) }
  return { text: 'Onbekend', color: FALLBACK_COLOR }
}
