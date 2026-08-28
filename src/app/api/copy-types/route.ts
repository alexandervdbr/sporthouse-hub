import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Niet ingelogd.', { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return new Response('clientId vereist.', { status: 400 })
  if (!hasClientAccess(user, clientId)) return new Response('Geen toegang tot deze klant.', { status: 403 })

  const { data, error } = await supabase
    .from('copy_types')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Niet ingelogd.', { status: 401 })

  const { clientId, name } = await request.json()
  if (!clientId || !name?.trim()) return new Response('clientId en name vereist.', { status: 400 })
  if (!hasClientAccess(user, clientId)) return new Response('Geen toegang tot deze klant.', { status: 403 })

  const { data, error } = await supabase
    .from('copy_types')
    .insert({ client_id: clientId, name: name.trim() })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Niet ingelogd.', { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return new Response('id vereist.', { status: 400 })

  const { data: copyType } = await supabase.from('copy_types').select('client_id').eq('id', id).single()
  if (!copyType) return new Response('Niet gevonden.', { status: 404 })
  if (!hasClientAccess(user, copyType.client_id)) return new Response('Geen toegang tot deze klant.', { status: 403 })

  const { error } = await supabase.from('copy_types').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
