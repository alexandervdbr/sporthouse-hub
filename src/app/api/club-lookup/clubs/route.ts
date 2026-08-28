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
    .from('club_lookup_clubs')
    .select('id, full_name, short_name, competition, level, country, sofascore_id, needs_name, updated_at')
    .eq('client_id', clientId)
    .order('competition')
    .order('full_name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const { clientId, full_name, short_name, competition, level, country, sofascore_id } = body
  if (!clientId || !full_name || !short_name) {
    return new Response('clientId, full_name en short_name zijn verplicht', { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('club_lookup_clubs')
    .insert({
      client_id: clientId,
      full_name: full_name.trim(),
      short_name: short_name.trim(),
      competition: (competition ?? '').trim(),
      level: (level ?? '').trim(),
      country: (country ?? '').trim(),
      sofascore_id: (sofascore_id ?? '').trim(),
      needs_name: false,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const { id, full_name, short_name, competition, level, country, sofascore_id, needs_name } = body
  if (!id) return new Response('id required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('club_lookup_clubs')
    .update({
      full_name: full_name?.trim(),
      short_name: short_name?.trim(),
      competition: competition?.trim(),
      level: level?.trim(),
      country: country?.trim(),
      sofascore_id: sofascore_id?.trim(),
      needs_name: needs_name ?? false,
      updated_at: new Date().toISOString(),
    })
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
  const { error } = await admin.from('club_lookup_clubs').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
