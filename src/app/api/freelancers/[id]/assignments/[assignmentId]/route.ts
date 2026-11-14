import { createAdminClient } from '@/lib/supabase/server'
import { trashFile } from '@/lib/drive-storage'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { assignmentUpdateSchema } from '@/features/freelancers/lib/schemas-legacy'

// Elke query filtert ook op het freelancer-id uit de URL: vroeger volstond
// het opdracht-id, ongeacht onder welke freelancer het gevraagd werd.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id, assignmentId } = await params
  if (!isUuid(id) || !isUuid(assignmentId)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, assignmentUpdateSchema)
  if ('error' in body) return body.error

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .update(body.data)
    .eq('id', assignmentId)
    .eq('freelancer_id', id)
    .select('*, freelancer_assignment_files(*)')
    .maybeSingle()

  if (error) return new Response(error.message, { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id, assignmentId } = await params
  if (!isUuid(id) || !isUuid(assignmentId)) return new Response('Niet gevonden', { status: 404 })
  const admin = createAdminClient()

  const { data: assignment } = await admin
    .from('freelancer_assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('freelancer_id', id)
    .maybeSingle()
  if (!assignment) return new Response('Niet gevonden', { status: 404 })

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
    const trashed = await Promise.allSettled(driveIds.map(id => trashFile(id)))
    trashed.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`Kon Drive-bestand ${driveIds[i]} niet naar prullenbak verplaatsen:`, r.reason)
    })
  }

  // freelancer_assignment_files.assignment_id cascades on delete (see
  // 0034_client_delete_cascade_and_rls_backstop.sql) — this used to fail
  // silently whenever the assignment had file rows, since the error here
  // was never checked.
  const { error } = await admin.from('freelancer_assignments').delete().eq('id', assignmentId).eq('freelancer_id', id)
  if (error) {
    console.error('Freelancer-opdracht verwijderen mislukt:', error)
    return new Response(error.message, { status: 500 })
  }
  return new Response(null, { status: 204 })
}
