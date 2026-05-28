import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const admin = createAdminClient()

  // Delete files from storage first
  const { data: files } = await admin
    .from('freelancer_assignment_files')
    .select('file_url')
    .eq('assignment_id', assignmentId)

  if (files?.length) {
    await admin.storage.from('freelancer-assignments').remove(files.map(f => f.file_url))
  }

  await admin.from('freelancer_assignments').delete().eq('id', assignmentId)
  return new Response(null, { status: 204 })
}
