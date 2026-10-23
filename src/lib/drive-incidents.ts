import { createAdminClient } from '@/lib/supabase/server'

// Vastleggen dat Google het liet afweten.
//
// Aangeroepen vanuit withDriveRetry (lib/drive-storage) op het moment dat die
// het opgeeft: vier pogingen gedaan, fout komt van Google, de gebruiker ziet
// nu een foutmelding. Dat is het enige moment dat dit hoort te gebeuren —
// niet bij elke hapering onderweg, want die vangen de herpogingen al op.
//
// Eén rij voedt twee dingen: de banner die iedereen in de app te zien krijgt
// zolang het misgaat, en het logboek waarmee je achteraf kan zien hoe lang
// een storing duurde. Dat laatste ontbrak op 21 oktober volledig.
//
// Niets hierin mag de aanroeper raken. Er is net al iets misgegaan; dat
// verergeren door ook nog op het vastleggen te stranden is het laatste wat
// helpt. Vandaar dat alles in een try zit en er nooit iets omhoog gegooid
// wordt.
export async function recordDriveIncident(source: string, err: unknown): Promise<void> {
  try {
    const admin = createAdminClient()
    const message = (err as Error)?.message?.slice(0, 500) ?? 'onbekend'

    const { error } = await admin.from('drive_incidents').insert({ source, message })
    if (error) console.error('Kon Drive-storing niet vastleggen:', error.message)
    else console.warn(`Drive-storing vastgelegd: ${source} — ${message}`)
  } catch (err) {
    console.error('Drive-storing vastleggen mislukt:', err instanceof Error ? err.message : err)
  }
}
