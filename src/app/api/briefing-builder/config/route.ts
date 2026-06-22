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
    .from('briefing_builder_config')
    .select('asana_project_gid, asana_extra_project_gids')
    .eq('client_id', clientId)
    .maybeSingle()

  return Response.json(data ?? { asana_project_gid: '', asana_extra_project_gids: [] })
}

export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { clientId, asana_project_gid, asana_extra_project_gids } = await req.json()
  if (!clientId) return new Response('clientId required', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('briefing_builder_config')
    .upsert(
      {
        client_id: clientId,
        asana_project_gid: asana_project_gid ?? '',
        asana_extra_project_gids: asana_extra_project_gids ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
