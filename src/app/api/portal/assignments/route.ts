import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // Find the freelancer record for this user
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) return new Response('Not a freelancer', { status: 403 })

  const { data, error } = await admin
    .from('freelancer_assignments')
    .select('*, freelancer_assignment_files(*)')
    .eq('freelancer_id', freelancer.id)
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}
