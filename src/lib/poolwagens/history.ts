import { addDays, isISODate } from '@/lib/gear/dates'
import { brusselsDayStartISO } from './time'

// Filters van de historiek (ritten), uit de querystring. Ongeldige waarden
// vallen weg in plaats van een fout te geven: een oude link blijft werken.

/**
 * Zoektekst voor de klant: getrimd, hoogstens 100 tekens, en zonder de tekens
 * die in een PostgREST-filter iets betekenen (komma, haakjes, *, %, …), zodat
 * een zoekterm nooit een ander filter kan worden.
 */
export function clientSearch(value: string | null): string | null {
  const clean = (value ?? '').replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
  return clean || null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const HISTORY_PAGE_SIZE = 50

export interface HistoryFilters {
  car: string | null
  user: string | null
  /** Zoekt in de gekoppelde klant en in de getypte klantnaam. */
  client: string | null
  /** Vertrek vanaf (Brusselse dag, inbegrepen), als tijdstip. */
  fromISO: string | null
  /** Vertrek tot en met (Brusselse dag, inbegrepen) → begin van de dag erna. */
  untilISO: string | null
  /** Alleen open ritten: vertrokken, niet terug, geplande terugkomst voorbij. */
  open: boolean
  page: number
}

export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const id = (k: string) => { const v = params.get(k); return v && UUID_RE.test(v) ? v : null }
  const day = (k: string) => { const v = params.get(k); return v && isISODate(v) ? v : null }
  const from = day('from')
  const to = day('to')
  const page = Number(params.get('page') ?? '0')
  return {
    car: id('car'),
    user: id('user'),
    client: clientSearch(params.get('klant')),
    fromISO: from ? brusselsDayStartISO(from) : null,
    untilISO: to ? brusselsDayStartISO(addDays(to, 1)) : null,
    open: params.get('open') === '1',
    page: Number.isInteger(page) && page >= 0 && page < 10_000 ? page : 0,
  }
}
