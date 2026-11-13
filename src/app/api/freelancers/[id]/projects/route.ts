import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { projectCreateSchema } from '@/features/freelancers/lib/schemas'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  const { data, error } = await auth.supabase
    .from('freelancer_projects')
    .select('*')
    .eq('freelancer_id', id)
    .order('date', { ascending: false })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })
  const body = await parseBody(req, projectCreateSchema)
  if ('error' in body) return body.error
  const { project_name, description, client_name, date, score, notes } = body.data

  const admin = createAdminClient()

  // Insert the project
  const { data: project, error } = await admin
    .from('freelancer_projects')
    .insert({
      freelancer_id: id,
      project_name,
      description: description ?? null,
      client_name: client_name ?? null,
      date: date ?? null,
      score: score ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Recalculate freelancer rating based on all project scores (1–5 scale)
  const { data: allProjects } = await admin
    .from('freelancer_projects')
    .select('score')
    .eq('freelancer_id', id)

  const scores = (allProjects ?? [])
    .map(p => p.score)
    .filter((s): s is number => s != null && s >= 1 && s <= 5)

  let newRating: number | null = null
  if (scores.length > 0) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    newRating = Math.round(avg * 10) / 10 // round to 1 decimal
  }

  // Update the freelancer's rating
  await admin
    .from('freelancers')
    .update({ rating: newRating ? Math.round(newRating) : null })
    .eq('id', id)

  return Response.json({ ...project, new_freelancer_rating: newRating ? Math.round(newRating) : null }, { status: 201 })
}
