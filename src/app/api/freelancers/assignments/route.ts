import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { assignmentCreateSchema } from '@/features/freelancers/lib/schemas'
import { ASSIGNMENT_COLUMNS } from '@/features/freelancers/lib/columns'
import { recordEvent } from '@/features/freelancers/lib/assignments-server'
import { shareAssignment } from '@/features/freelancers/lib/share'
import { LinkSecretError } from '@/features/freelancers/lib/link-crypto'

// GET  (bekijken) — opdrachten over alle freelancers heen, voor het tabblad
//      Opdrachten. ?freelancer=<id> beperkt tot één freelancer. Het scherm
//      groepeert zelf ("Wacht op ons", Gedeeld, Lopend, …).
// POST (beheren)  — nieuwe opdracht: een concept, of met share=true meteen
//      gedeeld (met zo nodig een nieuwe link + pincode in het antwoord).
const LIST_SELECT = `${ASSIGNMENT_COLUMNS}, freelancer:freelancers(id, name), client:clients(id, name), review:freelancer_reviews(score)`

export async function GET(req: Request) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const freelancer = new URL(req.url).searchParams.get('freelancer')
  let q = auth.supabase.from('freelancer_assignments').select(LIST_SELECT)
    .order('status_changed_at', { ascending: false }).limit(500)
  if (freelancer) {
    if (!isUuid(freelancer)) return Response.json([])
    q = q.eq('freelancer_id', freelancer)
  }
  const { data, error } = await q
  if (error) return new Response('Kon de opdrachten niet ophalen.', { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const body = await parseBody(req, assignmentCreateSchema)
  if ('error' in body) return body.error
  const { share, ...fields } = body.data

  const { data: freelancer } = await auth.supabase.from('freelancers')
    .select('id, archived_at').eq('id', fields.freelancer_id).maybeSingle()
  if (!freelancer) return new Response('Freelancer niet gevonden.', { status: 404 })
  if (freelancer.archived_at) return new Response('Deze freelancer is gearchiveerd.', { status: 409 })

  const { data: created, error } = await auth.supabase.from('freelancer_assignments').insert({
    ...fields,
    status: 'concept',
    created_by: auth.user.id,
    created_by_email: auth.user.email ?? null,
  }).select(ASSIGNMENT_COLUMNS).single()
  if (error || !created) {
    if (error?.code === '23503') return new Response('Klant of discipline bestaat niet.', { status: 400 })
    return new Response('Kon de opdracht niet opslaan.', { status: 500 })
  }
  const a = created as unknown as { id: string; freelancer_id: string }
  await recordEvent(auth.supabase, { assignmentId: a.id, actorType: 'team', actorId: auth.user.id, kind: 'status', to: 'concept' })

  if (!share) return Response.json({ assignment: created, link: null }, { status: 201 })

  try {
    const r = await shareAssignment(auth.supabase, createAdminClient(), a, auth.user.id)
    if (!r.ok) {
      // De opdracht bestaat als concept; delen kan opnieuw vanuit de opdracht.
      return Response.json({ assignment: created, link: null, shareError: r.error }, { status: 201 })
    }
    return Response.json({ assignment: r.assignment, link: r.link }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const msg = err instanceof LinkSecretError ? 'De persoonlijke links zijn niet ingesteld (FREELANCER_LINK_SECRET).' : 'Delen mislukte.'
    return Response.json({ assignment: created, link: null, shareError: msg }, { status: 201 })
  }
}
