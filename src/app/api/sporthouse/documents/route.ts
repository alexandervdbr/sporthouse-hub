import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

function safeStorageName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
}

function permKey(section: string) {
  return section === 'finance' ? 'financien' : 'administratie'
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const section = new URL(req.url).searchParams.get('section')
  if (!section) return new Response('Missing section', { status: 400 })

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const pk = permKey(section)
  if (!isAdmin && !sections.includes(`${pk}_bekijken`) && !sections.includes(`${pk}_beheren`)) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sporthouse_documents')
    .select('*')
    .eq('section', section)
    .order('created_at', { ascending: false })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const formData = await req.formData()
  const section = formData.get('section') as string | null
  const description = formData.get('description') as string | null
  const file = formData.get('file') as File | null

  if (!section || !file) return new Response('Missing section or file', { status: 400 })

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const pk = permKey(section)
  if (!isAdmin && !sections.includes(`${pk}_beheren`)) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = createAdminClient()
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  const storagePath = `${section}/${Date.now()}-${safeStorageName(file.name)}`

  const { error: storErr } = await admin.storage
    .from('sporthouse-internal')
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type || 'application/octet-stream' })

  if (storErr) return new Response(storErr.message, { status: 500 })

  const { data, error } = await admin
    .from('sporthouse_documents')
    .insert({
      section,
      filename: file.name,
      description: description?.trim() || null,
      file_type: ext,
      file_size: file.size,
      storage_path: storagePath,
      uploaded_by: user.email,
    })
    .select()
    .single()

  if (error) {
    await admin.storage.from('sporthouse-internal').remove([storagePath])
    return new Response(error.message, { status: 500 })
  }

  return Response.json(data, { status: 201 })
}
