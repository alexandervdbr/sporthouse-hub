// Onder welke interne klant een nieuwe collega in Team komt.
//
// Altijd Sporthouse, op naam — zoals de rest van het platform Sporthouse
// herkent (finance, administratie, de volgorde in de zijbalk). Niet "de eerste
// interne klant": daar hoort ook Friends of Sports bij, en de database geeft
// ze in geen vaste volgorde terug.
//
// Geen of meerdere treffers is een fout en geen gok: dan liever de uitnodiging
// weigeren dan iemand onder de verkeerde klant zetten.

export const TEAM_CLIENT_NAME = 'Sporthouse'

export type TeamClientPick =
  | { ok: true; id: string }
  | { ok: false; error: string }

export function pickTeamClient(internClients: { id: string; name: string }[]): TeamClientPick {
  const hits = internClients.filter(c => c.name.trim() === TEAM_CLIENT_NAME)
  if (hits.length === 1) return { ok: true, id: hits[0].id }
  if (hits.length === 0) {
    return { ok: false, error: `Geen interne klant "${TEAM_CLIENT_NAME}" gevonden. Nieuwe collega's komen daar in Team; maak die klant eerst aan of controleer de naam.` }
  }
  return { ok: false, error: `Er zijn ${hits.length} interne klanten met de naam "${TEAM_CLIENT_NAME}". Hou er één over, dan kan de uitnodiging verder.` }
}
