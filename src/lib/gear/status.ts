// De toestand van een unit. Vervangt "KAPOT" dat in de spreadsheet elke dag
// opnieuw als naam ingevuld stond.
//
// - ok:          gewoon te boeken
// - beperkt:     te boeken, maar met een kanttekening ("Kapotte vijs")
// - defect:      niet te boeken tot het hersteld is
// - uit_dienst:  niet meer in gebruik, blijft bewaard voor de geschiedenis

export const UNIT_STATUSES = ['ok', 'beperkt', 'defect', 'uit_dienst'] as const
export type UnitStatus = typeof UNIT_STATUSES[number]

export function isUnitStatus(value: string): value is UnitStatus {
  return (UNIT_STATUSES as readonly string[]).includes(value)
}

export function isBookable(status: UnitStatus): boolean {
  return status === 'ok' || status === 'beperkt'
}

export const STATUS_LABEL: Record<UnitStatus, string> = {
  ok:         'In orde',
  beperkt:    'Beperkt bruikbaar',
  defect:     'Defect',
  uit_dienst: 'Uit dienst',
}
