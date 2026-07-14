import { createClient, createAdminClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/drive-storage'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.app_metadata?.permissions?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') ? user : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const body = await req.json()

  const updates: Record<string, unknown> = {}
  if ('title' in body) updates.title = body.title?.trim()
  if ('briefing' in body) updates.briefing = body.briefing?.trim() || null
  if ('deadline' in body) updates.deadline = body.deadline || null
  if ('client_name' in body) updates.client_name = body.client_name?.trim() || null
  if ('status' in body) {
    if (!['nieuw', 'in_behandeling', 'afgerond'].includes(body.status)) {
      return new Response('invalid status', { status: 400 })
    }
    updates.status = body.status
  }

  if ('title' in updates && !updates.title) return new Response('title required', { status: 400 })
  if (Object.keys(updates).length === 0) return new Response('nothing to update', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('*, freelancer_assignment_files(*)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  if (!await assertAdmin()) return new Response('Forbidden', { status: 403 })
  const { assignmentId } = await params
  const admin = createAdminClient()

  // Delete files from storage first (Supabase and/or Drive, depending on
  // when each was uploaded)
  const { data: files } = await admin
    .from('freelancer_assignment_files')
    .select('file_url, storage_provider, drive_file_id')
    .eq('assignment_id', assignmentId)

  if (files?.length) {
    const supabasePaths = files.filter(f => f.storage_provider !== 'drive' && f.file_url).map(f => f.file_url!)
    if (supabasePaths.length) {
      await admin.storage.from('freelancer-assignments').remove(supabasePaths)
    }
    const driveIds = files.filter(f => f.storage_provider === 'drive' && f.drive_file_id).map(f => f.drive_file_id!)
    await Promise.allSettled(driveIds.map(id => deleteFile(id)))
  }

  await admin.from('freelancer_assignments').delete().eq('id', assignmentId)
  return new Response(null, { status: 204 })
}
