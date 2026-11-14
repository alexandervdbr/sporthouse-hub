import Anthropic from '@anthropic-ai/sdk'
import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { matchSchema } from '@/features/freelancers/lib/schemas'
import { prefilter, rankWithClaude, type MatchCandidate } from '@/features/freelancers/lib/match'
import { todayInBrussels } from '@/lib/gear/dates'

export const maxDuration = 120

// POST (beheren) {description, discipline?, deadline?} — top 3 met reden en
// aandachtspunt. De server haalt zelf de freelancers en hun cijfers op; de
// browser stuurt alleen de opdracht. Zie src/features/freelancers/lib/match.ts.
export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const body = await parseBody(req, matchSchema)
  if ('error' in body) return body.error

  const [{ data: freelancers, error }, { data: stats }, { data: disciplines }] = await Promise.all([
    auth.supabase.from('freelancers')
      .select('id, name, disciplines, status, availability, available_from, archived_at, overall_rating, rate_amount, rate_unit, rate_note, notes')
      .is('archived_at', null),
    auth.supabase.from('freelancer_stats').select('freelancer_id, review_avg, review_count'),
    auth.supabase.from('freelancer_disciplines').select('key, label'),
  ])
  if (error) return new Response('Kon de freelancers niet ophalen.', { status: 500 })

  const statsById = new Map((stats ?? []).map(s => [s.freelancer_id as string, s]))
  const all: MatchCandidate[] = (freelancers ?? []).map(f => {
    const s = statsById.get(f.id as string)
    return {
      ...(f as unknown as Omit<MatchCandidate, 'review_avg' | 'review_count'>),
      review_avg: s?.review_avg != null ? Number(s.review_avg) : null,
      review_count: Number(s?.review_count ?? 0),
    }
  })
  const candidates = prefilter(all, { discipline: body.data.discipline, deadline: body.data.deadline, today: todayInBrussels() })
  const labels = Object.fromEntries((disciplines ?? []).map(d => [d.key as string, d.label as string]))

  try {
    const ranked = await rankWithClaude(body.data.description, candidates, labels)
    const byId = new Map(candidates.map(c => [c.id, c]))
    return Response.json({
      kandidaten: candidates.length,
      matches: ranked.map(r => ({ ...r, freelancer: { id: r.id, name: byId.get(r.id)!.name } })),
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return new Response('De AI is even overbelast. Probeer zo opnieuw.', { status: 429 })
    if (err instanceof Anthropic.APIError) console.error(`Freelancers: match-fout ${err.status}:`, err.message)
    else console.error('Freelancers: match mislukt:', (err as Error).message)
    return new Response('Kon geen match maken. Probeer opnieuw.', { status: 502 })
  }
}
