import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser, hasClientAccess } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user && isAdminUser(user) ? user : null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return new Response('clientId required', { status: 400 })
  if (!hasClientAccess(user, clientId)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('club_lookup_competitions')
    .select('id, name, country, level')
    .eq('client_id', clientId)
    .order('country')
    .order('level', { ascending: true, nullsFirst: false })
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { clientId, name, country, level } = await req.json()
  if (!clientId || !name) return new Response('clientId en name zijn verplicht', { status: 400 })

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('club_lookup_competitions')
    .select('id')
    .eq('client_id', clientId)
    .ilike('name', name.trim())
    .maybeSingle()

  if (existing) return Response.json(existing)

  const { data, error } = await admin
    .from('club_lookup_competitions')
    .insert({
      client_id: clientId,
      name: name.trim(),
      country: (country ?? '').trim(),
      level: level ?? null,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id, level } = await req.json()
  if (!id) return new Response('id required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('club_lookup_competitions')
    .update({ level: level ?? null })
    .eq('id', id)
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
  const { error } = await admin.from('club_lookup_competitions').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
