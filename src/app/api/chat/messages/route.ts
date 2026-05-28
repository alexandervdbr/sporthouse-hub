import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const channelId = searchParams.get('channelId')
  if (!channelId) return new Response('channelId required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { channelId, content, attachmentUrl, attachmentName, attachmentType } = await req.json()
  if (!channelId) return new Response('channelId required', { status: 400 })
  if (!content?.trim() && !attachmentUrl) return new Response('content or attachment required', { status: 400 })

  const email = user.email ?? ''
  const namePart = email.split('@')[0]
  const userName = namePart.split('.').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      channel_id: channelId,
      content: content?.trim() || '',
      created_by: email,
      user_name: userName,
      attachment_url: attachmentUrl ?? null,
      attachment_name: attachmentName ?? null,
      attachment_type: attachmentType ?? null,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Send push notification to all other subscribers
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: userName,
        body: content?.trim() || '📎 Bijlage',
        url: '/chat',
        excludeUserId: user.id,
      }),
    })
  } catch {
    // push is non-critical
  }

  return Response.json(data, { status: 201 })
}
