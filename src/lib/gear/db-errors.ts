// Een fout van Postgres (via Supabase) omzetten naar een HTTP-status en een
// melding voor het scherm. De functies in de database (0071, 0072) geven al
// Nederlandse meldingen; die gaan ongewijzigd door. Voor de fouten die
// Postgres zelf geeft, staat hier een leesbare tekst.

export interface DbError {
  code?: string | null
  message?: string | null
}

const STATUS_BY_CODE: Record<string, number> = {
  '42501': 403, // geen recht (RLS of functie)
  '23505': 409, // bestaat al
  '23503': 409, // hangt nog ergens aan / onbekende verwijzing
  '23P01': 409, // overlapt met een boeking
  '23514': 400, // regel geschonden
  '22023': 400, // ongeldige invoer
  'P0001': 409, // regel van een functie (bv. "minstens één categorie")
  'P0002': 404, // niet gevonden
  'PGRST116': 404, // .single() vond geen rij (bestaat niet, of RLS verbergt hem)
}

const GENERIC_TEXT: Record<string, string> = {
  '23505': 'Dit bestaat al. Kies een andere naam.',
  '23503': 'Dit hangt nog samen met iets anders en kan zo niet opgeslagen of verwijderd worden.',
  '42501': 'Je hebt hier geen rechten voor.',
  'PGRST116': 'Niet gevonden.',
}

/** Meldingen van Postgres zelf (Engels) herkennen we aan deze stukjes. */
const POSTGRES_PHRASES = ['violates', 'duplicate key', 'row-level security', 'permission denied', 'cannot coerce', 'json object requested']

export function dbErrorStatus(err: DbError): number {
  return (err.code && STATUS_BY_CODE[err.code]) || 500
}

export function dbErrorText(err: DbError): string {
  const msg = err.message?.trim() ?? ''
  const fromPostgres = POSTGRES_PHRASES.some(p => msg.toLowerCase().includes(p))
  if (msg && !fromPostgres) return msg
  return (err.code && GENERIC_TEXT[err.code]) || 'Er ging iets mis bij het opslaan.'
}
