import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function requireFreelancerAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const ok = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') || sections.includes('freelancers')
  return ok ? user : null
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const supabase = await createClient()
  const { id } = await params
  const { error } = await supabase.from('freelancers').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('freelancers')
    .update(body)
    .eq('id', id)
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
