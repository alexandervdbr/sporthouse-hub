import type { Freelancer } from './types'

// Pure stukjes logica van de interne UI, apart zodat ze te testen zijn
// zonder browser (zie src/lib/__tests__/freelancers-bugs.test.ts).

/** Een antwoord van PATCH/rating/archive/avatar bevat geen cijfers: houd de vorige. */
export function mergeFreelancer(prev: Freelancer | null, next: Freelancer): Freelancer {
  return { ...next, stats: next.stats ?? prev?.stats ?? null }
}

/** Klanten waarvoor een opdracht kan: geen interne afdelingen (categorie "intern"). */
export function assignableClients<T extends { category?: string | null }>(clients: T[]): T[] {
  return clients.filter(c => c.category !== 'intern')
}

export function disciplineLabel(key: string | null | undefined, labels: Record<string, string>): string {
  if (!key) return '—'
  return labels[key] ?? key
}

// Startwaarden van de profielkaarten. Elke keer dat een kaart opengaat,
// opnieuw uit de opgeslagen gegevens — zo blijft er na "Annuleren" niets
// van een vorige, niet-bewaarde wijziging hangen.
export const seed = {
  contact: (f: Freelancer) => ({ name: f.name, phone: f.phone ?? '', email: f.email ?? '', disciplines: [...f.disciplines] }),
  rate: (f: Freelancer) => ({ amount: f.rate_amount != null ? String(f.rate_amount) : '', unit: (f.rate_unit ?? '') as '' | 'uur' | 'dag' | 'project', note: f.rate_note ?? '' }),
  availability: (f: Freelancer) => ({ availability: f.availability, from: f.available_from ?? '' }),
  rating: (f: Freelancer) => ({ value: f.overall_rating, note: f.overall_rating_note ?? '' }),
  links: (f: Freelancer) => f.portfolio_links.map(l => `${l.label} | ${l.url}`).join('\n'),
  notes: (f: Freelancer) => f.notes ?? '',
}

/** Status wijzigen: een fout wordt een melding, geen stille, onafgehandelde rejection. */
export async function saveStatus(
  update: (id: string, body: object) => Promise<Freelancer>, id: string, status: Freelancer['status'],
): Promise<{ ok: true; freelancer: Freelancer } | { ok: false; error: string }> {
  try { return { ok: true, freelancer: await update(id, { status }) } }
  catch (err) { return { ok: false, error: (err as Error).message || 'Kon de status niet wijzigen.' } }
}

// ── Nieuwe opdracht: aanmaken, bijlagen, delen ──────────────────────────────
// Lukt een latere stap niet (bijlagen, delen), dan bestaat de opdracht al.
// Opnieuw proberen mag dan GEEN tweede opdracht maken: de flow onthoudt het
// id en gaat verder waar hij stopte.

export interface SubmitApi {
  create: () => Promise<{ id: string }>
  upload: (id: string) => Promise<string[]>
  share: (id: string) => Promise<{ link: { url: string; pin: string } | null }>
}
export interface SubmitState { createdId: string | null; uploaded: boolean }
export interface SubmitResult { id: string; link: { url: string; pin: string } | null; warnings: string[] }

export async function submitAssignment(api: SubmitApi, state: SubmitState, share: boolean): Promise<SubmitResult> {
  if (!state.createdId) state.createdId = (await api.create()).id
  const id = state.createdId
  let warnings: string[] = []
  if (!state.uploaded) {
    warnings = await api.upload(id)
    state.uploaded = true
  }
  const link = share ? (await api.share(id)).link : null
  return { id, link, warnings }
}
