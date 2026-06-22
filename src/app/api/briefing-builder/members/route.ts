import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return new Response('clientId required', { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('briefing_builder_members')
    .select('id, contact_name, contact_email')
    .eq('client_id', clientId)
    .order('created_at')

  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { clientId, contact_name, contact_email } = await req.json()
  if (!clientId || !contact_name || !contact_email) {
    return new Response('clientId, contact_name en contact_email zijn verplicht', { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('briefing_builder_members')
    .insert({ client_id: clientId, contact_name, contact_email })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return new Response('id required', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('briefing_builder_members').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
