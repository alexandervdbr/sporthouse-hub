import { addDays, diffDays, isISODate } from '@/lib/gear/dates'
import { brusselsDayStartISO } from './time'

// Het venster dat /api/poolwagens/planning ophaalt: from–to (hele dagen,
// beide inbegrepen) of een maand. Hoogstens 62 dagen, zodat één verzoek
// klein blijft.

const MAX_RANGE_DAYS = 62

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function parsePlanningRange(params: URLSearchParams): { start: string; end: string } | { error: string } {
  const month = params.get('month')
  if (month !== null) {
    const m = MONTH_RE.exec(month)
    if (!m) return { error: 'month (YYYY-MM) is ongeldig' }
    const year = Number(m[1]), mo = Number(m[2])
    const next = mo === 12 ? `${year + 1}-01` : `${year}-${String(mo + 1).padStart(2, '0')}`
    return { start: brusselsDayStartISO(`${month}-01`), end: brusselsDayStartISO(`${next}-01`) }
  }

  const from = params.get('from') ?? '', to = params.get('to') ?? ''
  if (!isISODate(from) || !isISODate(to)) return { error: 'from en to (YYYY-MM-DD) zijn verplicht' }
  if (to < from) return { error: 'to ligt vóór from' }
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) return { error: `Hoogstens ${MAX_RANGE_DAYS} dagen per keer` }
  return { start: brusselsDayStartISO(from), end: brusselsDayStartISO(addDays(to, 1)) }
}
