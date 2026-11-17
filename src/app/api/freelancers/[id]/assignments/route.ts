import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { assignmentCreateSchema } from '@/features/freelancers/lib/schemas-legacy'

// Was alleen voor admins, terwijl de knoppen zichtbaar waren voor iedereen
// met het freelancerrecht. Nu: bekijken leest, beheren schrijft.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .select('*, freelancer_assignment_files(*)')
    .eq('freelancer_id', id)
    .order('deadline', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  const body = await parseBody(req, assignmentCreateSchema)
  if ('error' in body) return body.error
  const a = body.data

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .insert({
      freelancer_id: id,
      title: a.title,
      briefing: a.briefing ?? null,
      deadline: a.deadline ?? null,
      client_name: a.client_name ?? null,
      created_by: auth.user.email,
      status: 'nieuw',
    })
    .select('*, freelancer_assignment_files(*)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
