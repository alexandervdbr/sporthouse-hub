import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // Get all read statuses for this user
  const { data: readStatuses } = await admin
    .from('chat_read_status')
    .select('channel_id, last_read_at')
    .eq('user_id', user.id)

  const readMap: Record<string, string> = {}
  for (const rs of readStatuses ?? []) {
    readMap[rs.channel_id] = rs.last_read_at
  }

  // Get all channels
  const { data: channels } = await admin.from('chat_channels').select('id')
  if (!channels?.length) return Response.json({ total: 0 })

  let total = 0

  await Promise.all(channels.map(async (ch) => {
    const lastRead = readMap[ch.id]
    let query = admin
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', ch.id)
      .neq('created_by', user.email ?? '')

    if (lastRead) {
      query = query.gt('created_at', lastRead)
    }

    const { count } = await query
    total += count ?? 0
  }))

  return Response.json({ total })
}
