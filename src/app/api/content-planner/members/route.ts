import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) return new Response('clientId required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_planner_members')
    .select('id, contact_name, contact_email, role')
    .eq('client_id', clientId)
    .order('role')
    .order('contact_name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { clientId, contact_name, contact_email, role } = await req.json()
  if (!clientId || !contact_name || !contact_email || !role) {
    return new Response('Missing fields', { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_planner_members')
    .insert({ client_id: clientId, contact_name, contact_email, role })
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
  const { error } = await admin
    .from('content_planner_members')
    .delete()
    .eq('id', id)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
