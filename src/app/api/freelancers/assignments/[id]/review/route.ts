import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { reviewSchema } from '@/features/freelancers/lib/schemas'
import { REVIEW_COLUMNS } from '@/features/freelancers/lib/columns'

// PUT    (beheren) — review van een afgeronde opdracht (één per opdracht).
// DELETE (beheren) — review weg.
// Strikt intern: nooit zichtbaar op de link. Het gemiddelde (review_avg)
// rekent de view freelancer_stats uit; het wordt nergens opgeslagen, en
// overall_rating verandert hier NIET.
type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, reviewSchema)
  if ('error' in body) return body.error

  const { data: a } = await auth.supabase.from('freelancer_assignments').select('status').eq('id', id).maybeSingle()
  if (!a) return new Response('Niet gevonden', { status: 404 })
  if (a.status !== 'afgerond') return new Response('Alleen een afgeronde opdracht kan beoordeeld worden.', { status: 409 })

  const { data, error } = await auth.supabase.from('freelancer_reviews').upsert({
    assignment_id: id,
    score: body.data.score,
    score_quality: body.data.score_quality ?? null,
    score_deadline: body.data.score_deadline ?? null,
    score_communication: body.data.score_communication ?? null,
    comment: body.data.comment ?? null,
    reviewer_id: auth.user.id,
  }, { onConflict: 'assignment_id' }).select(REVIEW_COLUMNS).single()
  if (error) return new Response('Kon de review niet opslaan.', { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { data, error } = await auth.supabase.from('freelancer_reviews').delete().eq('assignment_id', id).select('id')
  if (error) return new Response('Kon de review niet verwijderen.', { status: 500 })
  if (!data?.length) return new Response('Niet gevonden', { status: 404 })
  return new Response(null, { status: 204 })
}
