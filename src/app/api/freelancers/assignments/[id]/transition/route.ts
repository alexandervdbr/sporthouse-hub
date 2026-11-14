import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { transitionSchema } from '@/features/freelancers/lib/schemas'
import { applyTransition } from '@/features/freelancers/lib/assignments-server'
import { shareAssignment } from '@/features/freelancers/lib/share'
import { LinkSecretError } from '@/features/freelancers/lib/link-crypto'

// POST (beheren) {to, message?} — een statuswijziging door het team.
// Toegelaten overgangen: src/features/freelancers/lib/statuses.ts (één lijst,
// ook voor de publieke link). Delen maakt zo nodig eerst een link aan; de
// pincode staat dan één keer in het antwoord.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, transitionSchema)
  if ('error' in body) return body.error
  const { to, message } = body.data

  if (to === 'gedeeld') {
    const { data: a } = await auth.supabase.from('freelancer_assignments')
      .select('id, freelancer_id, status').eq('id', id).maybeSingle()
    if (!a) return new Response('Niet gevonden', { status: 404 })
    if (a.status !== 'concept') return new Response(`Van "${a.status}" naar "gedeeld" kan niet.`, { status: 409 })
    try {
      const r = await shareAssignment(auth.supabase, createAdminClient(), a, auth.user.id)
      if (!r.ok) return new Response(r.error, { status: r.status })
      return Response.json({ assignment: r.assignment, link: r.link }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err) {
      if (err instanceof LinkSecretError) {
        return new Response('De persoonlijke links zijn niet ingesteld op deze omgeving (FREELANCER_LINK_SECRET).', { status: 503 })
      }
      return new Response('Delen mislukte.', { status: 500 })
    }
  }

  const r = await applyTransition(auth.supabase, { assignmentId: id, to, actor: 'team', actorId: auth.user.id, message })
  if (!r.ok) return new Response(r.error, { status: r.status })
  return Response.json({ assignment: r.assignment, link: null })
}
