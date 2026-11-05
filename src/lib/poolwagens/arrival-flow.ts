// Aankomst registreren met (optioneel) een schademelding erbij. Altijd eerst
// de aankomst, daarna de schade. Mislukt de schade, dan blijft de aankomst
// geregistreerd: opnieuw proberen slaat de aankomst dan over en probeert
// alleen de schade nog eens.

export type DamageResult = { ok: true; message: string } | { ok: false; error: string }

export type ArrivalOutcome =
  /** De aankomst zelf lukte niet; er is niets opgeslagen. */
  | { stage: 'aankomst-mislukt'; error: string }
  /** De aankomst staat erin, de schademelding niet. */
  | { stage: 'schade-mislukt'; error: string }
  /** Alles gelukt; met de melding van de schade als die er was. */
  | { stage: 'klaar'; damageMessage: string | null }

export async function runArrival({ arrivalDone, saveArrival, saveDamage }: {
  /** Is de aankomst al opgeslagen (bij opnieuw proberen)? */
  arrivalDone: boolean
  saveArrival: () => Promise<unknown>
  /** null: geen schade gemeld. */
  saveDamage: (() => Promise<DamageResult>) | null
}): Promise<ArrivalOutcome> {
  if (!arrivalDone) {
    try {
      await saveArrival()
    } catch (e) {
      return { stage: 'aankomst-mislukt', error: (e as Error).message }
    }
  }
  if (!saveDamage) return { stage: 'klaar', damageMessage: null }
  const result = await saveDamage().catch((e: Error): DamageResult => ({ ok: false, error: e.message }))
  return result.ok ? { stage: 'klaar', damageMessage: result.message } : { stage: 'schade-mislukt', error: result.error }
}
