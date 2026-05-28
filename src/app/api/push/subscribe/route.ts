import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const subscription = await req.json()
  const admin = createAdminClient()

  await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }, { onConflict: 'endpoint' })

  return new Response('OK', { status: 201 })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { endpoint } = await req.json()
  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)

  return new Response('OK')
}
