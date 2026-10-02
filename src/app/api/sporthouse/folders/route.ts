import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canViewSection, canManageSection, isSporthouseSection } from '@/lib/sporthouse-docs'
import { getSessionUser } from '@/lib/supabase/claims'

// Tegenhanger van /api/folders voor Sporthouse Intern-documenten. Zelfde
// contract, maar gegroepeerd per section in plaats van per client, en achter
// de financien_*/administratie_*-permissies.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
    // Read path: the token is verified locally instead of being confirmed with
  // the Auth server on every call — see lib/supabase/claims. Writes in this
  // file still use getUser().
  const user = await getSessionUser(supabase)
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const section = searchParams.get('section')
  const parentId = searchParams.get('parentId') // 'null' string = root

  if (!isSporthouseSection(section)) return new Response('section required', { status: 400 })
  if (!canViewSection(user, section)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  let query = admin
    .from('sporthouse_document_folders')
    .select('*')
    .eq('section', section)
    .order('name', { ascending: true })

  query = !parentId || parentId === 'null'
    ? query.is('parent_id', null)
    : query.eq('parent_id', parentId)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { section, name, parentId } = await req.json()
  if (!isSporthouseSection(section)) return new Response('section required', { status: 400 })
  if (!name?.trim()) return new Response('name required', { status: 400 })
  if (!canManageSection(user, section)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()

  // A nested folder must belong to the same section as its parent, otherwise a
  // crafted parentId could graft a finance folder under administration.
  if (parentId) {
    const { data: parent } = await admin
      .from('sporthouse_document_folders')
      .select('section')
      .eq('id', parentId)
      .single()
    if (!parent) return new Response('Parent folder not found', { status: 404 })
    if (parent.section !== section) return new Response('Parent folder belongs to another section', { status: 400 })
  }

  const folderName = name.trim()
  const parent = parentId || null

  // Same guard as the client-files twin: a repeated request hands back the
  // folder that already exists instead of making a second one.
  const { data: duplicate } = parent === null
    ? await admin.from('sporthouse_document_folders').select('*').eq('section', section).eq('name', folderName).is('parent_id', null).maybeSingle()
    : await admin.from('sporthouse_document_folders').select('*').eq('section', section).eq('name', folderName).eq('parent_id', parent).maybeSingle()

  if (duplicate) return Response.json(duplicate, { status: 200 })

  const { data, error } = await admin
    .from('sporthouse_document_folders')
    .insert({
      section,
      name: folderName,
      parent_id: parent,
      created_by: user.email,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
