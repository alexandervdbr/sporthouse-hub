import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/supabase/claims'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
    // Read path: the token is verified locally instead of being confirmed with
  // the Auth server on every call — see lib/supabase/claims. Writes in this
  // file still use getUser().
  const user = await getSessionUser(supabase)
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
  const folderName = name.trim()
  const parent = parentId || null

  // Pressing enter twice in quick succession sent two requests and got two
  // identical folders. The client now latches on the first one, but that only
  // covers the one way it happened — a retried request or a second tab would
  // do the same. Handing back the folder that already exists makes a repeat
  // call harmless wherever it comes from.
  const { data: duplicate } = parent === null
    ? await admin.from('file_folders').select('*').eq('client_id', clientId).eq('name', folderName).is('parent_id', null).maybeSingle()
    : await admin.from('file_folders').select('*').eq('client_id', clientId).eq('name', folderName).eq('parent_id', parent).maybeSingle()

  if (duplicate) return Response.json(duplicate, { status: 200 })

  const { data, error } = await admin
    .from('file_folders')
    .insert({
      client_id: clientId,
      name: folderName,
      parent_id: parent,
      created_by: user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
