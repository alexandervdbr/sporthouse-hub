import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const parentId = searchParams.get('parentId') // 'null' string = root

  if (!clientId) return new Response('clientId required', { status: 400 })
  if (!hasClientAccess(user, clientId)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  let query = admin
    .from('file_folders')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true })

  if (!parentId || parentId === 'null') {
    query = query.is('parent_id', null)
  } else {
    query = query.eq('parent_id', parentId)
  }

  const { data, error } = await query

  // If the table doesn't exist yet (SQL not run), return empty array gracefully
  if (error) {
    if (error.message.includes('file_folders') || error.message.includes('does not exist')) {
      return Response.json([])
    }
    return new Response(error.message, { status: 500 })
  }

  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { clientId, name, parentId } = await req.json()
  if (!clientId || !name?.trim()) return new Response('clientId and name required', { status: 400 })
  if (!hasClientAccess(user, clientId)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('file_folders')
    .insert({
      client_id: clientId,
      name: name.trim(),
      parent_id: parentId || null,
      created_by: user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
