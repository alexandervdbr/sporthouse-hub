import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { ratingSchema } from '@/features/freelancers/lib/schemas'
import { FREELANCER_COLUMNS } from '@/features/freelancers/lib/columns'

// PUT (beheren) — het handmatige, interne totaalcijfer (1–5) met toelichting.
// Dit is de ENIGE plek in de code die overall_rating schrijft: het wordt
// nooit automatisch berekend. Het gemiddelde van de reviews (review_avg) is
// iets anders en wordt nergens opgeslagen (view freelancer_stats).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, ratingSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase.from('freelancers').update({
    overall_rating: body.data.overall_rating,
    overall_rating_note: body.data.overall_rating_note ?? null,
    overall_rating_updated_at: new Date().toISOString(),
    overall_rating_updated_by: auth.user.id,
  }).eq('id', id).select(FREELANCER_COLUMNS).maybeSingle()
  if (error) return new Response('Kon de beoordeling niet opslaan.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}
