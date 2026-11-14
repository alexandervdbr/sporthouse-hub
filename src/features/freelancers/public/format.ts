// Opmaak voor de link: gewone taal, Belgische notatie.

const DAY = 86_400_000

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

/** "vandaag", "morgen", "over 3 dagen", "gisteren", "3 dagen te laat". */
export function relativeDeadline(date: string, now = new Date()): { text: string; late: boolean } {
  const days = Math.round((startOfDay(new Date(`${date}T00:00:00`)) - startOfDay(now)) / DAY)
  if (days === 0) return { text: 'vandaag', late: false }
  if (days === 1) return { text: 'morgen', late: false }
  if (days > 1) return { text: `over ${days} dagen`, late: false }
  if (days === -1) return { text: 'gisteren (te laat)', late: true }
  return { text: `${-days} dagen te laat`, late: true }
}

export function longDate(date: string) {
  return new Date(date.length === 10 ? `${date}T00:00:00` : date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fileSize(bytes: number | null) {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`
}

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

export const STATUS_TEXT: Record<string, string> = {
  gedeeld: 'Wacht op jouw antwoord', geaccepteerd: 'Bezig', opgeleverd: 'Opgeleverd', afgerond: 'Afgerond', geweigerd: 'Geweigerd',
}
