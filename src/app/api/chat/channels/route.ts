import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chat_channels')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  if (!ADMIN_EMAILS.includes(user.email ?? '') && !sections.includes('beheer')) return new Response('Forbidden', { status: 403 })

  const { name, description, category, color } = await req.json()
  if (!name?.trim()) return new Response('name required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chat_channels')
    .insert({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: description?.trim() || null,
      category: category?.trim() || 'Algemeen',
      color: color || null,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
