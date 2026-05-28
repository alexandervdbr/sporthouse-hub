import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return new Response('file required', { status: 400 })

  const ext = file.name.split('.').pop()
  const safeName = `${assignmentId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const admin = createAdminClient()
  const { error: storageError } = await admin.storage
    .from('freelancer-assignments')
    .upload(safeName, file, { upsert: false })

  if (storageError) return new Response(storageError.message, { status: 500 })

  const { data, error } = await admin
    .from('freelancer_assignment_files')
    .insert({
      assignment_id: assignmentId,
      file_name: file.name,
      file_url: safeName,
      file_size: file.size,
      file_type: file.type,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const { fileId, fileUrl } = await req.json()

  const admin = createAdminClient()
  await admin.storage.from('freelancer-assignments').remove([fileUrl])
  await admin.from('freelancer_assignment_files').delete()
    .eq('id', fileId).eq('assignment_id', assignmentId)

  return new Response(null, { status: 204 })
}
