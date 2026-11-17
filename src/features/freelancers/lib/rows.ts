// Wat de lijst-API teruggeeft: de freelancer, plus het gemiddelde van de
// scores van zijn samenwerkingen. Dat gemiddelde staat nooit in de database
// en overschrijft de handmatige beoordeling (overall_rating) nooit.

export interface Collab { avg: number | null; count: number; scored: number }

/** Gemiddelde van de scores 1–5, op één decimaal; samenwerkingen zonder score tellen mee in count, niet in het gemiddelde. */
export function collabStats(projects: { score: number | null }[] | null | undefined): Collab {
  const all = projects ?? []
  const scores = all.map(p => p.score).filter((s): s is number => typeof s === 'number' && s >= 1 && s <= 5)
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null
  return { avg, count: all.length, scored: scores.length }
}

/** Een rij uit LIST_COLUMNS → freelancer + collab, zonder de geneste projecten. */
export function toListRow<T extends { freelancer_projects?: { score: number | null }[] | null }>(row: T) {
  const { freelancer_projects, ...rest } = row
  return { ...rest, collab: collabStats(freelancer_projects) }
}
