// Waar een inzending in Drive terechtkomt, en hoe het bestand daar heet.
//
// Twee routes moeten hetzelfde antwoord geven: upload-session maakt de map
// aan, en finalize rekent hem opnieuw uit om te controleren dat het bestand
// er ook echt in beland is. Zouden die twee van elkaar gaan afwijken, dan
// weigert finalize een upload die prima is aangekomen — of erger, keurt hij
// er een goed die ergens anders staat. Dus staat het pad hier, één keer.

export type PreassistSection = 'content' | 'inspiratie'

export function preassistSectionLabel(section: PreassistSection): string {
  return section === 'content' ? 'Content' : 'Inspiratie'
}

export function preassistFolderSegments(
  editionTitle: string,
  section: PreassistSection,
  clientName: string
): string[] {
  return ['Pré-Assist', editionTitle, preassistSectionLabel(section), clientName]
}

// De naam van de inzender staat vooraan in de bestandsnaam, zodat een map in
// Drive — of een uitgepakte zip — leesbaar blijft zonder de app ernaast.
export function preassistUploadName(userName: string, filename: string): string {
  return `${userName} — ${filename}`
}
