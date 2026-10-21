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
// De map van een editie: één niveau boven Content en Inspiratie, dus alles
// van die sessie in één keer.
export function preassistEditionFolderSegments(editionTitle: string): string[] {
  return ['Pré-Assist', editionTitle]
}

export function driveFolderUrl(driveFolderId: string): string {
  return `https://drive.google.com/drive/folders/${driveFolderId}`
}

// Content hangt aan een klant en daarbinnen aan een project, zodat alles van
// één shoot bij elkaar staat in plaats van los onder de klant. Inspiratie
// hangt nergens aan; daar vervallen beide lagen, zodat er geen map "Algemeen"
// ontstaat die niets betekent.
export function preassistFolderSegments(
  editionTitle: string,
  section: PreassistSection,
  clientName: string | null,
  project?: string | null
): string[] {
  const base = [...preassistEditionFolderSegments(editionTitle), preassistSectionLabel(section)]
  if (!clientName) return base
  const withClient = [...base, clientName]
  // Een mapnaam met een schuine streep erin maakt in Drive ongemerkt twee
  // mappen; vandaar dat die eruit gaat voordat het een pad wordt.
  const safe = project?.trim().replace(/[\/\\]/g, '-')
  return safe ? [...withClient, safe] : withClient
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
