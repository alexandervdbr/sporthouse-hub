import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function requireFreelancerAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const ok = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') || sections.includes('freelancers')
  return ok ? user : null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
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
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { project_name, description, client_name, date, score, notes } = body
  if (!project_name?.trim()) return new Response('project_name required', { status: 400 })

  const admin = createAdminClient()

  // Insert the project
  const { data: project, error } = await admin
    .from('freelancer_projects')
    .insert({
      freelancer_id: id,
      project_name: project_name.trim(),
      description: description?.trim() || null,
      client_name: client_name?.trim() || null,
      date: date || null,
      score: score || null,
      notes: notes?.trim() || null,
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
