// Voor wie een boeking is.
//
// Een boeking hoort bij een persoon, een klant, of allebei. Hooguit één soort
// persoon: een collega (account), een freelancer, of een externe naam als
// vrije tekst. Een klant alleen mag ook — in de planning stond materiaal
// rechtstreeks op NoStrezz.
//
// Dit is dezelfde regel die de database afdwingt met twee checks op
// gear_bookings; hier staat hij zodat het formulier het al zegt vóór het
// opslaan, met dezelfde uitkomst.

export interface BookingHolder {
  userId?: string | null
  freelancerId?: string | null
  externalName?: string | null
  clientId?: string | null
}

export type HolderError = 'geen_persoon_of_klant' | 'meerdere_personen'

/** Lege of enkel-spaties-waarden tellen als niet ingevuld, zoals in de database na trimmen. */
function filled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function normalizeHolder(h: BookingHolder): Required<BookingHolder> {
  return {
    userId:       filled(h.userId) ? h.userId!.trim() : null,
    freelancerId: filled(h.freelancerId) ? h.freelancerId!.trim() : null,
    externalName: filled(h.externalName) ? h.externalName!.trim() : null,
    clientId:     filled(h.clientId) ? h.clientId!.trim() : null,
  }
}

export function validateHolder(h: BookingHolder): HolderError | null {
  const n = normalizeHolder(h)
  const persons = [n.userId, n.freelancerId, n.externalName].filter(Boolean).length
  if (persons > 1) return 'meerdere_personen'
  if (persons === 0 && !n.clientId) return 'geen_persoon_of_klant'
  return null
}

export const HOLDER_ERROR_TEXT: Record<HolderError, string> = {
  geen_persoon_of_klant: 'Kies voor wie het is: een persoon, een klant of allebei.',
  meerdere_personen:     'Kies één persoon: een collega, een freelancer of een externe naam.',
}
