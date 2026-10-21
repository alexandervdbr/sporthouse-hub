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

// Inspiratie hangt niet aan een klant: het is materiaal dat iemand opvalt,
// geen werk dat ergens bij hoort. Zonder klant vervalt die maplaag, zodat er
// in Drive geen map "Algemeen" ontstaat die niets betekent.
export function preassistFolderSegments(
  editionTitle: string,
  section: PreassistSection,
  clientName: string | null
): string[] {
  const base = ['Pré-Assist', editionTitle, preassistSectionLabel(section)]
  return clientName ? [...base, clientName] : base
}

// Of er voor deze sectie een klant gekozen moet worden. Staat hier en niet in
// de modal, omdat upload-session en finalize dezelfde vraag stellen en een
// verschil van mening daar een upload weigert die prima is.
export function preassistRequiresClient(section: PreassistSection): boolean {
  return section === 'content'
}

// De naam van de inzender staat vooraan in de bestandsnaam, zodat een map in
// Drive — of een uitgepakte zip — leesbaar blijft zonder de app ernaast.
export function preassistUploadName(userName: string, filename: string): string {
  return `${userName} — ${filename}`
}
