import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { email } = await req.json()
  if (user.email !== email) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!freelancer) return new Response('Not a freelancer', { status: 404 })
  return new Response('OK')
}
