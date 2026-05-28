import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId  = searchParams.get('clientId')
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')
  const eventId   = searchParams.get('eventId')

  if (!clientId) return new Response('Missing clientId', { status: 400 })

  let query = supabase
    .from('content_posts')
    .select('*')
    .eq('client_id', clientId)
    .order('scheduled_date', { ascending: true })

  if (startDate && endDate) query = query.gte('scheduled_date', startDate).lte('scheduled_date', endDate)
  if (eventId)              query = query.eq('event_id', eventId)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']
function allowed(user: { email?: string | null; user_metadata?: Record<string, unknown> }, section: string) {
  if (ADMIN_EMAILS.includes(user.email ?? '')) return true
  const sections = (user.user_metadata?.permissions as { sections?: string[] } | null)?.sections ?? null
  return sections === null || sections.includes(section)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!allowed(user, 'contentkalender_toevoegen')) return new Response('Forbidden', { status: 403 })

  const { clientId, title, copy, platform, status, scheduled_date, scheduled_time, format, creator, collab, link, event_id } = await request.json()
  if (!clientId || !title || !scheduled_date) return new Response('Missing required fields', { status: 400 })

  const { data, error } = await supabase
    .from('content_posts')
    .insert({
      client_id:      clientId,
      title:          title.trim(),
      copy:           copy           || null,
      platform:       platform       || null,
      status:         status         || 'concept',
      scheduled_date,
      scheduled_time: scheduled_time || null,
      format:         format         || null,
      creator:        creator        || null,
      collab:         collab         || null,
      link:           link           || null,
      event_id:       event_id       || null,
      created_by:     user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
