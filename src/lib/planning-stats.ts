// De afwezige dagen achter de tellingen in Statistieken: welke dag, welke
// helft, en wat erbij genoteerd stond.
//
// De tellingen zeggen hoeveel verlof iemand nam. Deze lijst zegt wanneer, en
// waarom — "tandarts", "vroeger weg voor event". Alleen afwezigheid, geen
// werkdagen: dat is wat de pagina toont, en het houdt het antwoord klein.

import { splitThuis } from './planning-status'

export type Helft = 'dag' | 'vm' | 'nm'

export interface AfwezigeDag {
  contactId: string
  month: number
  day: number
  // Zoals opgeslagen, dus "VERLOF" of "RECUP".
  value: string
  helft: Helft
  // De notitie hoort bij de hele dag. Bij een halve dag staat ze dus bij de
  // afwezige helft, en bij allebei als beide helften afwezig zijn.
  note: string | null
}

interface Rij {
  contact_id: string
  month: number
  day: number
  value: string
  value_pm: string | null
  note: string | null
}

// `afwezig` krijgt de status zonder " - THUIS", in hoofdletters.
export function afwezigeDagen(rows: Rij[], afwezig: (status: string) => boolean): AfwezigeDag[] {
  const out: AfwezigeDag[] = []
  const isAfwezig = (v: string) => afwezig(splitThuis(v).base.toUpperCase())

  for (const r of rows) {
    const note = r.note?.trim() || null
    const pm = r.value_pm?.trim() ? r.value_pm : null
    // Twee keer dezelfde status is een hele dag, zoals in de telling.
    const helften: [string, Helft][] = !pm || pm === r.value
      ? [[r.value, 'dag']]
      : [[r.value, 'vm'], [pm, 'nm']]
    for (const [value, helft] of helften) {
      if (!value.trim() || !isAfwezig(value)) continue
      out.push({ contactId: r.contact_id, month: r.month, day: r.day, value, helft, note })
    }
  }

  return out.sort((a, b) => a.month - b.month || a.day - b.day || (a.helft === 'nm' ? 1 : 0) - (b.helft === 'nm' ? 1 : 0))
}
