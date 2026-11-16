// Nepdata voor het prototype van de herwerkte freelancertool. Niets hiervan
// komt uit of gaat naar de database; herladen zet alles terug.

export type FStatus = 'vast' | 'proefopdracht' | 'kandidaat' | 'inactief'
export type Availability = 'beschikbaar' | 'beperkt' | 'niet_beschikbaar'
export type AStatus = 'concept' | 'gedeeld' | 'geaccepteerd' | 'geweigerd' | 'opgeleverd' | 'afgerond' | 'geannuleerd'

export interface PFreelancer {
  id: string; name: string; disciplines: string[]; status: FStatus
  teamRating: number | null; teamNote: string
  availability: Availability; availableFrom: string | null; availabilityBy: 'freelancer' | 'team'
  phone: string; email: string; rate: string; notes: string
  portfolio: { label: string; url: string }[]
  link: { active: boolean; lastOpened: string | null }
}
export interface PFile { name: string; size: string; by: 'team' | 'freelancer'; at: string }
export interface PEvent { at: string; who: 'team' | 'freelancer'; text: string; message?: string }
export interface PAssignment {
  id: string; title: string; freelancerId: string; client: string; discipline: string
  briefing: string; deadline: string | null; status: AStatus; changedAt: string
  seen: boolean; review: { score: number; comment: string } | null
  files: PFile[]; events: PEvent[]
  /** Bug 7: wat na "Nieuwe opdracht" nog niet gelukt is. */
  pending: { failedFiles: string[]; share: boolean } | null
}

export const DISCIPLINES: { key: string; label: string }[] = [
  { key: 'video', label: 'Video' }, { key: 'foto', label: 'Foto' }, { key: 'montage', label: 'Montage' },
  { key: 'motion', label: 'Motion design' }, { key: 'drone', label: 'Drone' }, { key: 'social', label: 'Social media' },
  { key: 'copy', label: 'Copywriting' },
]
export const LABEL: Record<string, string> = Object.fromEntries(DISCIPLINES.map(d => [d.key, d.label]))

export const CLIENTS = ['KV Hasselt', 'Padelclub Gent', 'Atletiek Limburg', 'Podcast Buitenspel', 'Wielerteam Kempen', 'Zwemclub De Golf']

export const FSTATUS_LABEL: Record<FStatus, string> = { vast: 'Vast', proefopdracht: 'Proefopdracht', kandidaat: 'Kandidaat', inactief: 'Inactief' }

const DAY = 86400_000
/** Datum (yyyy-mm-dd) n dagen van vandaag. */
export const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
/** Tijdstip n dagen geleden. */
const ago = (n: number, h = 10) => { const d = new Date(Date.now() - n * DAY); d.setHours(h, 0, 0, 0); return d.toISOString() }

export function makeData(): { freelancers: PFreelancer[]; assignments: PAssignment[] } {
  const fl = (id: string, name: string, disciplines: string[], status: FStatus, o: Partial<PFreelancer> = {}): PFreelancer => ({
    id, name, disciplines, status, teamRating: null, teamNote: '', availability: 'beschikbaar', availableFrom: null, availabilityBy: 'freelancer',
    phone: '+32 470 12 34 56', email: `${name.split(' ')[0].toLowerCase()}@voorbeeld.be`, rate: '', notes: '',
    portfolio: [], link: { active: true, lastOpened: ago(3) }, ...o,
  })
  const freelancers: PFreelancer[] = [
    fl('f1', 'Jana Peeters', ['video', 'montage'], 'vast', { teamRating: 5, rate: '€450 / dag', notes: 'Snel, denkt mee. Eigen Sony FX3-kit.', portfolio: [{ label: 'Showreel', url: 'https://vimeo.com' }] }),
    fl('f2', 'Tom Wouters', ['foto'], 'vast', { teamRating: 4, rate: '€350 / dag', availability: 'beperkt', availableFrom: day(12), notes: 'Sterk in actiefoto’s, minder in portret.' }),
    fl('f3', 'Lotte Claes', ['motion', 'social'], 'vast', { teamRating: 4, rate: '€55 / uur' }),
    fl('f4', 'Bram De Smet', ['drone', 'video'], 'proefopdracht', { rate: '€400 / dag', notes: 'Drone-attest A2. Proefopdracht bij Wielerteam Kempen.' }),
    fl('f5', 'Sara Janssens', ['copy', 'social'], 'vast', { teamRating: 3, rate: '€0,15 / woord', availability: 'niet_beschikbaar', availableFrom: day(30), availabilityBy: 'team', notes: 'Met zwangerschapsverlof tot half december.' }),
    fl('f6', 'Youssef El Amrani', ['video', 'foto'], 'proefopdracht', { rate: '€300 / dag', link: { active: true, lastOpened: null } }),
    fl('f7', 'Emma Vermeulen', ['montage'], 'vast', { teamRating: 5, rate: '€50 / uur' }),
    fl('f8', 'Ruben Maes', ['foto', 'drone'], 'kandidaat', { link: { active: false, lastOpened: null }, notes: 'Via LinkedIn. Portfolio ziet er goed uit.', portfolio: [{ label: 'Instagram', url: 'https://instagram.com' }] }),
    fl('f9', 'Nina Goossens', ['motion'], 'kandidaat', { link: { active: false, lastOpened: null } }),
    fl('f10', 'Pieter Hermans', ['video'], 'inactief', { teamRating: 2, notes: 'Twee keer deadline gemist (2025).' }),
    fl('f11', 'Fien Willems', ['social', 'foto'], 'vast', { teamRating: 4, rate: '€300 / dag', availability: 'beperkt', availableFrom: null }),
    fl('f12', 'Arne Jacobs', ['video', 'drone'], 'vast', { teamRating: null, rate: '€420 / dag' }),
  ]

  let n = 0
  const as = (title: string, freelancerId: string, client: string, discipline: string, status: AStatus, changed: number, o: Partial<PAssignment> = {}): PAssignment => ({
    id: `a${++n}`, title, freelancerId, client, discipline, status, changedAt: ago(changed), deadline: null, seen: status !== 'concept' && status !== 'gedeeld',
    briefing: 'Korte aftermovie van de wedstrijd, 60–90 seconden, 9:16 en 16:9. Sfeer, supporters, de goals. Muziek uit onze bibliotheek. Ruwe beelden ook aanleveren.',
    review: null, files: [], events: [], pending: null, ...o,
  })
  const ev = (d: number, who: PEvent['who'], text: string, message?: string): PEvent => ({ at: ago(d, 9 + (d % 7)), who, text, message })
  const brief = { name: 'Briefing.pdf', size: '240 kB', by: 'team' as const, at: ago(6) }

  const assignments: PAssignment[] = [
    as('Aftermovie thuismatch tegen Lommel', 'f1', 'KV Hasselt', 'video', 'opgeleverd', 1, { deadline: day(-1), files: [brief, { name: 'Aftermovie_v1_9x16.mp4', size: '412 MB', by: 'freelancer', at: ago(1) }, { name: 'Aftermovie_v1_16x9.mp4', size: '398 MB', by: 'freelancer', at: ago(1) }],
      events: [ev(1, 'freelancer', 'Opgeleverd'), ev(5, 'freelancer', 'Geaccepteerd'), ev(6, 'team', 'Gedeeld')] }),
    as('Fotoreeks clubkampioenschap', 'f2', 'Padelclub Gent', 'foto', 'opgeleverd', 0, { deadline: day(2), files: [{ name: 'Selectie_48_fotos.zip', size: '1,2 GB', by: 'freelancer', at: ago(0) }],
      briefing: 'Finales zaterdag 14u–18u. Actie, prijsuitreiking, sfeer. 40–60 geselecteerde foto’s, bewerkt.',
      events: [ev(0, 'freelancer', 'Opgeleverd'), ev(4, 'freelancer', 'Geaccepteerd'), ev(5, 'team', 'Gedeeld')] }),
    as('Reels: 3 x trainingsweek', 'f3', 'Atletiek Limburg', 'social', 'geaccepteerd', 2, { deadline: day(4),
      events: [ev(2, 'freelancer', 'Geaccepteerd'), ev(3, 'team', 'Gedeeld')] }),
    as('Dronebeelden parcours Kempenklassieker', 'f4', 'Wielerteam Kempen', 'drone', 'geaccepteerd', 3, { deadline: day(-1),
      events: [ev(1, 'team', 'Teruggestuurd met feedback', 'De openingsshot is te donker — kan je de versie van 7u30 nemen?'), ev(2, 'freelancer', 'Opgeleverd'), ev(3, 'freelancer', 'Geaccepteerd'), ev(4, 'team', 'Gedeeld')] }),
    as('Montage podcast afl. 42', 'f7', 'Podcast Buitenspel', 'montage', 'geaccepteerd', 1, { deadline: day(1),
      events: [ev(1, 'freelancer', 'Geaccepteerd'), ev(1, 'team', 'Gedeeld')] }),
    as('Teaser nieuw seizoen', 'f12', 'KV Hasselt', 'video', 'gedeeld', 1, { deadline: day(9), seen: true, files: [brief],
      events: [ev(1, 'freelancer', 'Bekeken'), ev(1, 'team', 'Gedeeld')] }),
    as('Portretten jeugdploeg U17', 'f6', 'Zwemclub De Golf', 'foto', 'gedeeld', 3, { deadline: day(6), seen: false,
      events: [ev(3, 'team', 'Gedeeld')] }),
    as('Nieuwsbrief december', 'f5', 'Atletiek Limburg', 'copy', 'concept', 0, {}),
    as('Motion intro podcast', 'f3', 'Podcast Buitenspel', 'motion', 'concept', 2, { deadline: day(14) }),
    as('Aftermovie bekerfinale', 'f1', 'KV Hasselt', 'video', 'afgerond', 8, { review: { score: 5, comment: 'Top, klant was erg tevreden.' }, files: [{ name: 'Bekerfinale_final.mp4', size: '520 MB', by: 'freelancer', at: ago(9) }],
      events: [ev(8, 'team', 'Goedgekeurd'), ev(9, 'freelancer', 'Opgeleverd')] }),
    as('Productfoto’s fanshop', 'f11', 'KV Hasselt', 'foto', 'afgerond', 15, { review: { score: 4, comment: '' }, events: [ev(15, 'team', 'Goedgekeurd')] }),
    as('Social kalender oktober', 'f11', 'Padelclub Gent', 'social', 'afgerond', 24, { review: { score: 4, comment: 'Goed, iets meer variatie graag.' }, events: [ev(24, 'team', 'Goedgekeurd')] }),
    as('Clubfilm 50 jaar', 'f12', 'Zwemclub De Golf', 'video', 'afgerond', 45, { review: { score: 5, comment: '' }, events: [ev(45, 'team', 'Goedgekeurd')] }),
    as('Livestream-graphics', 'f9', 'Wielerteam Kempen', 'motion', 'geweigerd', 2, { deadline: day(5),
      events: [ev(2, 'freelancer', 'Geweigerd', 'Sorry, die week zit ik vol.'), ev(3, 'team', 'Gedeeld')] }),
    as('Fotoshoot sponsors', 'f10', 'Padelclub Gent', 'foto', 'geannuleerd', 10, { events: [ev(10, 'team', 'Geannuleerd')] }),
    as('Video interview hoofdtrainer', 'f1', 'Atletiek Limburg', 'video', 'afgerond', 60, { review: { score: 4, comment: '' } }),
    as('Foto’s seizoensopener', 'f2', 'KV Hasselt', 'foto', 'afgerond', 70, { review: { score: 5, comment: '' } }),
    as('Foto’s jeugdtornooi', 'f2', 'Zwemclub De Golf', 'foto', 'afgerond', 90, { review: { score: 4, comment: '' } }),
  ]
  return { freelancers, assignments }
}

// ── Afgeleide gegevens ──────────────────────────────────────────────────────

export function reviewsOf(f: PFreelancer, all: PAssignment[]) {
  const scores = all.filter(a => a.freelancerId === f.id && a.review).map(a => a.review!.score)
  return { avg: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null, count: scores.length }
}

/** Eén cijfer in de lijst: gemiddelde van de opdrachten; zonder opdrachten het teamoordeel. */
export function ratingOf(f: PFreelancer, all: PAssignment[]): { value: number | null; count: number; team: boolean } {
  const r = reviewsOf(f, all)
  if (r.avg != null) return { value: r.avg, count: r.count, team: false }
  return { value: f.teamRating, count: 0, team: f.teamRating != null }
}

export function lastAssignment(f: PFreelancer, all: PAssignment[]) {
  return all.filter(a => a.freelancerId === f.id && a.status !== 'concept')
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))[0] ?? null
}

export function isAvailable(f: PFreelancer, by: string = day(0)) {
  return f.availability === 'beschikbaar' || (!!f.availableFrom && f.availableFrom <= by)
}

/** Aanbevolen freelancers voor een opdracht: discipline, beschikbaar op de deadline, cijfer, ervaring met de klant. */
export function recommend(all: PFreelancer[], assignments: PAssignment[], o: { discipline: string; deadline: string; client: string }) {
  return all.filter(f => f.status !== 'inactief').map(f => {
    const match = !!o.discipline && f.disciplines.includes(o.discipline)
    const avail = isAvailable(f, o.deadline || day(0)) ? (f.availability === 'beschikbaar' ? 2 : 1.5) : f.availability === 'beperkt' ? 1 : 0
    const r = ratingOf(f, assignments)
    const knowsClient = !!o.client && assignments.some(a => a.freelancerId === f.id && a.client === o.client && a.status === 'afgerond')
    const score = (match ? 4 : 0) + avail + (r.value ?? 2.5) / 2.5 + (knowsClient ? 1 : 0) + (f.status === 'vast' ? 0.5 : 0)
    const why: string[] = []
    if (match) why.push(LABEL[o.discipline])
    why.push(avail >= 1.5 ? (f.availability === 'beschikbaar' ? 'beschikbaar' : 'beschikbaar tegen de deadline') : f.availability === 'beperkt' ? 'beperkt beschikbaar' : 'niet beschikbaar')
    if (knowsClient) why.push(`werkte al voor ${o.client}`)
    return { f, score, why, match, avail }
  }).sort((a, b) => b.score - a.score)
}
