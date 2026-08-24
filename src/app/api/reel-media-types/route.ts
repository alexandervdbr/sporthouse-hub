import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasSection } from '@/lib/auth-permissions'

// Anyone logged in can read the current list (needed to render the folder
// view / type picker), but only staff with the 'mijn_gedacht_types_beheren'
// permission (granted per-user in Beheer > Gebruikers) can add a new one.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase.from('reel_media_types').select('id, name').order('created_at', { ascending: true })
  if (error) return new Response(error.message, { status: 500 })

  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!hasSection(user, 'mijn_gedacht_types_beheren')) return new Response('Forbidden', { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return new Response('Naam is verplicht.', { status: 400 })
  if (name.length > 40) return new Response('Naam is te lang.', { status: 400 })

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('reel_media_types')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle()

  if (existing) return Response.json(existing)

  const { data, error } = await admin
    .from('reel_media_types')
    .insert({ name, created_by: user.id })
    .select('id, name')
    .single()

  if (error) return new Response(error.message, { status: 500 })

  return Response.json(data, { status: 201 })
}
