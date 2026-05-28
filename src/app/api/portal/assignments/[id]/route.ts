import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { status } = await req.json()
  if (!['nieuw', 'in_behandeling', 'afgerond'].includes(status)) {
    return new Response('invalid status', { status: 400 })
  }

  const admin = createAdminClient()

  // Verify this assignment belongs to this freelancer
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) return new Response('Not a freelancer', { status: 403 })

  const { data: assignment } = await admin
    .from('freelancer_assignments')
    .select('id')
    .eq('id', id)
    .eq('freelancer_id', freelancer.id)
    .maybeSingle()

  if (!assignment) return new Response('Not found', { status: 404 })

  const { data, error } = await admin
    .from('freelancer_assignments')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
