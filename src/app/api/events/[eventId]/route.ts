import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!allowed(user, 'projectkalender_toevoegen')) return new Response('Forbidden', { status: 403 })

  const { eventId } = await params
  const { title, date, end_date, time, client_id, description, type } = await req.json()

  const { data, error } = await supabase
    .from('project_events')
    .update({
      title:       title?.trim(),
      date,
      end_date:    end_date    || null,
      time:        time        || null,
      client_id:   client_id   || null,
      description: description || null,
      type:        type        || null,
    })
    .eq('id', eventId)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']
function allowed(user: { email?: string | null; user_metadata?: Record<string, unknown> }, section: string) {
  if (ADMIN_EMAILS.includes(user.email ?? '')) return true
  const sections = (user.user_metadata?.permissions as { sections?: string[] } | null)?.sections ?? null
  return sections === null || sections.includes(section)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!allowed(user, 'projectkalender_verwijderen')) return new Response('Forbidden', { status: 403 })

  const { eventId } = await params
  const { error } = await supabase.from('project_events').delete().eq('id', eventId)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
