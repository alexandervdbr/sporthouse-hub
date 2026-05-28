import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')
  const clientId  = searchParams.get('clientId')

  let query = supabase
    .from('project_events')
    .select('*')
    .order('date', { ascending: true })
    .order('time', { ascending: true })

  if (startDate && endDate) query = query.gte('date', startDate).lte('date', endDate)
  if (clientId)             query = query.eq('client_id', clientId)

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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!allowed(user, 'projectkalender_toevoegen')) return new Response('Forbidden', { status: 403 })

  const { title, date, end_date, time, client_id, description, type } = await req.json()
  if (!title?.trim() || !date) return new Response('title and date required', { status: 400 })

  const { data, error } = await supabase
    .from('project_events')
    .insert({
      title:       title.trim(),
      date,
      end_date:    end_date    || null,
      time:        time        || null,
      client_id:   client_id   || null,
      description: description || null,
      type:        type        || null,
      created_by:  user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
