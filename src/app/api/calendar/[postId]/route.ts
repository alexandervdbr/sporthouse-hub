import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasSection, hasClientAccess } from '@/lib/auth-permissions'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!hasSection(user, 'contentkalender_toevoegen')) return new Response('Forbidden', { status: 403 })

  const { postId } = await params
  const { data: existing } = await supabase.from('content_posts').select('client_id').eq('id', postId).single()
  if (!existing) return new Response('Not found', { status: 404 })
  if (!hasClientAccess(user, existing.client_id)) return new Response('Forbidden', { status: 403 })

  const { title, copy, platform, status, scheduled_date, scheduled_time, format, creator, collab, link, event_id } = await request.json()

  const { data, error } = await supabase
    .from('content_posts')
    .update({
      title:          title?.trim(),
      copy:           copy           || null,
      platform:       platform       || null,
      status,
      scheduled_date,
      scheduled_time: scheduled_time || null,
      format:         format         || null,
      creator:        creator        || null,
      collab:         collab         || null,
      link:           link           || null,
      event_id:       event_id       || null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', postId)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!hasSection(user, 'contentkalender_verwijderen')) return new Response('Forbidden', { status: 403 })

  const { postId } = await params
  const { data: existing } = await supabase.from('content_posts').select('client_id').eq('id', postId).single()
  if (!existing) return new Response('Not found', { status: 404 })
  if (!hasClientAccess(user, existing.client_id)) return new Response('Forbidden', { status: 403 })

  const { error } = await supabase.from('content_posts').delete().eq('id', postId)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
