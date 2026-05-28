import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { channelId } = await req.json()
  if (!channelId) return new Response('channelId required', { status: 400 })

  const admin = createAdminClient()
  await admin.from('chat_read_status').upsert(
    { user_id: user.id, channel_id: channelId, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,channel_id' }
  )

  return new Response('OK')
}
