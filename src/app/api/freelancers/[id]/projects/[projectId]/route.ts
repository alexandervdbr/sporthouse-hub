import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const { id, projectId } = await params
  if (!isUuid(id) || !isUuid(projectId)) return new Response('Niet gevonden', { status: 404 })
  const admin = createAdminClient()

  // Alleen een project van deze freelancer: vroeger volstond het project-id,
  // en werd daarna de rating van een willekeurige andere freelancer herberekend.
  const { error } = await admin.from('freelancer_projects').delete().eq('id', projectId).eq('freelancer_id', id)
  if (error) return new Response(error.message, { status: 500 })

  // Recalculate rating after deletion
  const { data: allProjects } = await admin
    .from('freelancer_projects')
    .select('score')
    .eq('freelancer_id', id)

  const scores = (allProjects ?? [])
    .map(p => p.score)
    .filter((s): s is number => s != null && s >= 1 && s <= 5)

  const newRating = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  await admin.from('freelancers').update({ rating: newRating }).eq('id', id)

  return Response.json({ new_freelancer_rating: newRating }, { status: 200 })
}
