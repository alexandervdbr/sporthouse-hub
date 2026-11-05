// Kilometerstanden bij vertrek en aankomst. De database controleert dit
// opnieuw (0077); hier staat het voor een directe melding in het formulier.

export function arrivalKmError(departureKm: number, arrivalKm: number | null): string | null {
  if (arrivalKm === null) return 'Vul de kilometerstand bij aankomst in.'
  if (arrivalKm < departureKm) {
    return `De kilometerstand bij aankomst (${arrivalKm}) moet minstens die bij vertrek (${departureKm}) zijn.`
  }
  return null
}

export function drivenKm(departureKm: number | null, arrivalKm: number | null): number | null {
  return departureKm === null || arrivalKm === null ? null : arrivalKm - departureKm
}
