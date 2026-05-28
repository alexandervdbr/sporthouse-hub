import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

function permKey(section: string) {
  return section === 'finance' ? 'financien' : 'administratie'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return new Response('Not found', { status: 404 })

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const pk = permKey(doc.section)
  if (!isAdmin && !sections.includes(`${pk}_bekijken`) && !sections.includes(`${pk}_beheren`)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: signedData } = await admin.storage
    .from('sporthouse-internal')
    .createSignedUrl(doc.storage_path, 3600)

  if (!signedData) return new Response('Could not generate URL', { status: 500 })
  return Response.json({ url: signedData.signedUrl, filename: doc.filename })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return new Response('Not found', { status: 404 })

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const pk = permKey(doc.section)
  const canManage = isAdmin || sections.includes(`${pk}_beheren`)

  if (!canManage && doc.uploaded_by !== user.email) {
    return new Response('Forbidden', { status: 403 })
  }

  const { content } = await req.json()
  if (typeof content !== 'string') return new Response('Missing content', { status: 400 })

  const bytes = new TextEncoder().encode(content)

  const { error: storErr } = await admin.storage
    .from('sporthouse-internal')
    .update(doc.storage_path, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true })

  if (storErr) return new Response(storErr.message, { status: 500 })

  await admin
    .from('sporthouse_documents')
    .update({ file_size: bytes.byteLength })
    .eq('id', id)

  return new Response('OK')
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return new Response('Not found', { status: 404 })

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const pk = permKey(doc.section)
  const canManage = isAdmin || sections.includes(`${pk}_beheren`)

  if (!canManage && doc.uploaded_by !== user.email) {
    return new Response('Forbidden', { status: 403 })
  }

  await admin.storage.from('sporthouse-internal').remove([doc.storage_path])
  await admin.from('sporthouse_documents').delete().eq('id', id)
  return new Response('OK')
}
