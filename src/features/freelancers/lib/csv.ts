// CSV lezen en schrijven, zonder dependency. Leest wat Excel, Google Sheets
// en Numbers maken: scheidingsteken ; , of tab (geplakt uit een spreadsheet),
// velden tussen aanhalingstekens met "" erin en regeleinden erin, en een BOM.

const DELIMS = [';', ',', '\t'] as const

/** Het scheidingsteken dat het vaakst in de eerste regel staat (buiten aanhalingstekens). */
export function detectDelimiter(text: string): string {
  let inQ = false
  const count: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  for (const ch of text) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && (ch === '\n' || ch === '\r')) break
    else if (!inQ && ch in count) count[ch]++
  }
  return DELIMS.reduce((best, d) => (count[d] > count[best] ? d : best), DELIMS[0] as string)
}

/** Tekst → rijen van cellen. Volledig lege rijen vallen weg. */
export function parseCsv(input: string, delimiter = detectDelimiter(input.replace(/^﻿/, ''))): string[][] {
  const text = input.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false
      } else cell += ch
    } else if (ch === '"' && cell.trim() === '') { inQ = true; cell = '' }
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/** Rijen → CSV met ; en een BOM, zodat Excel in België het meteen goed opent. */
export function toCsv(rows: (string | number | null | undefined)[][], delimiter = ';'): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[";\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map(r => r.map(esc).join(delimiter)).join('\r\n') + '\r\n'
}
