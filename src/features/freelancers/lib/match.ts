import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { MATCH_MODEL } from './config'

// AI-match: welke 3 freelancers passen het best bij een opdracht?
//
// 1. Harde voorfilter (hier, in code — niet aan het model overgelaten):
//    niet gearchiveerd, niet inactief, de gekozen discipline, en beschikbaar.
//    "Niet beschikbaar" telt alleen mee als die persoon vóór de deadline weer
//    beschikbaar is.
// 2. Het model rangschikt de overblijvers en geeft per keuze een reden en een
//    aandachtspunt, als gestructureerde output (een Zod-schema), niet als
//    tekst die we zelf moeten ontleden.
// Alles op een schaal van 1–5: overall_rating (handmatig) en review_avg
// (gemiddelde van de reviews).

export interface MatchCandidate {
  id: string
  name: string
  disciplines: string[]
  status: string
  availability: string
  available_from: string | null
  archived_at: string | null
  overall_rating: number | null
  rate_amount: number | null
  rate_unit: string | null
  rate_note: string | null
  notes: string | null
  review_avg: number | null
  review_count: number
}

export function prefilter(all: MatchCandidate[], opts: { discipline?: string | null; deadline?: string | null; today: string }): MatchCandidate[] {
  const until = opts.deadline ?? opts.today
  return all.filter(f =>
    !f.archived_at
    && f.status !== 'inactief'
    && (!opts.discipline || f.disciplines.includes(opts.discipline))
    && (f.availability !== 'niet_beschikbaar' || (!!f.available_from && f.available_from <= until)),
  )
}

const STATUS_LABEL: Record<string, string> = {
  vast: 'vaste freelancer', proefopdracht: 'in proefopdracht', kandidaat: 'kandidaat (nog niet getest)',
}

function profile(f: MatchCandidate, labels: Record<string, string>): string {
  const rate = f.rate_amount != null ? `€${f.rate_amount} per ${f.rate_unit}` : null
  return [
    `ID: ${f.id}`,
    `Naam: ${f.name}`,
    `Disciplines: ${f.disciplines.map(d => labels[d] ?? d).join(', ') || 'niet opgegeven'}`,
    `Status: ${STATUS_LABEL[f.status] ?? f.status}`,
    `Beschikbaarheid: ${f.availability.replace('_', ' ')}${f.available_from ? ` (weer vanaf ${f.available_from})` : ''}`,
    `Totaalbeoordeling team (1–5): ${f.overall_rating ?? 'geen'}`,
    `Gemiddelde review van opdrachten (1–5): ${f.review_avg != null ? `${f.review_avg} over ${f.review_count} opdracht(en)` : 'nog geen reviews'}`,
    `Tarief: ${[rate, f.rate_note].filter(Boolean).join(' — ') || 'onbekend'}`,
    `Notities: ${f.notes?.trim() || '—'}`,
  ].join('\n')
}

const ResultSchema = z.object({
  matches: z.array(z.object({
    id: z.string().describe('De exacte ID uit het profiel'),
    reden: z.string().describe('Waarom deze freelancer past, 2–3 concrete zinnen'),
    aandachtspunt: z.string().nullable().describe('Een eerlijk aandachtspunt, of null'),
  })).max(3),
})

export interface MatchResult { id: string; rank: number; reden: string; aandachtspunt: string | null }

export async function rankWithClaude(
  description: string, candidates: MatchCandidate[], labels: Record<string, string>, client = new Anthropic(),
): Promise<MatchResult[]> {
  if (candidates.length === 0) return []

  const prompt = `Je helpt Sporthouse Group, een sportmediabedrijf, de beste freelancers te kiezen voor een opdracht.

OPDRACHT:
${description}

KANDIDATEN (al gefilterd op discipline en beschikbaarheid):
${candidates.map(c => profile(c, labels)).join('\n\n---\n\n')}

Kies de beste ${Math.min(3, candidates.length)}, van beste naar minder goede match. Weeg mee: hoe goed de disciplines en notities bij de opdracht passen, de totaalbeoordeling van het team en het gemiddelde van de reviews (beide op 1–5; met weinig reviews zegt een gemiddelde minder), of iemand vast is of nog getest moet worden, en het tarief als de opdracht een budget noemt. Verwijs in de reden naar concrete gegevens uit het profiel. Gebruik de exacte ID's.`

  // Sonnet 5.5 kan een verzoek weigeren (stop_reason "refusal"). Met de
  // server-side fallback ("default") neemt de API dan zelf een ander model,
  // binnen dezelfde call. Weigert ook dat, dan geen match in plaats van gokken.
  const response = await client.beta.messages.parse({
    model: MATCH_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(ResultSchema) },
  })

  if (response.stop_reason === 'refusal') throw new Error('Het model weigerde deze opdracht te beoordelen.')
  const parsed = response.parsed_output
  if (!parsed) throw new Error(`Geen bruikbaar antwoord van het model (stop_reason: ${response.stop_reason}).`)

  // Alleen ID's die echt kandidaat waren, elk één keer.
  const valid = new Set(candidates.map(c => c.id))
  const seen = new Set<string>()
  return parsed.matches
    .filter(m => valid.has(m.id) && !seen.has(m.id) && seen.add(m.id))
    .slice(0, 3)
    .map((m, i) => ({ id: m.id, rank: i + 1, reden: m.reden, aandachtspunt: m.aandachtspunt?.trim() || null }))
}
