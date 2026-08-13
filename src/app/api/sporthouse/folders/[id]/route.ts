import { createClient, createAdminClient } from '@/lib/supabase/server'
import { renameDriveFolder, deleteDriveFolder, moveFile, trashAndMoveFile } from '@/lib/drive-storage'
import { resolveSporthouseDriveFolderId } from '@/lib/sporthouse-docs-drive'
import { canManageSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import type { SupabaseClient } from '@supabase/supabase-js'

async function collectFolderIds(admin: SupabaseClient, rootId: string): Promise<string[]> {
  const ids = [rootId]
  let frontier = [rootId]
  while (frontier.length) {
    const { data: children } = await admin
      .from('sporthouse_document_folders')
      .select('id')
      .in('parent_id', frontier)
    const childIds = (children ?? []).map(c => c.id as string)
    if (!childIds.length) break
    ids.push(...childIds)
    frontier = childIds
  }
  return ids
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return new Response('name required', { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('sporthouse_document_folders')
    .select('section, drive_folder_id')
    .eq('id', id)
    .single()

  if (!existing) return new Response('Not found', { status: 404 })
  if (!canManageSection(user, existing.section as SporthouseSection)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data, error } = await admin
    .from('sporthouse_document_folders')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Best effort: a folder without drive_folder_id simply hasn't had its first
  // upload yet, so there is nothing in Drive to rename.
  if (existing.drive_folder_id) {
    try { await renameDriveFolder(existing.drive_folder_id, name.trim()) }
    catch (err) { console.error('Drive folder rename error:', err) }
  }

  return Response.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  // 'delete': documents go to the trash, recoverable for 30 days like any
  // other delete. 'move': they are relocated to the parent folder untouched.
  const mode = new URL(req.url).searchParams.get('mode') === 'delete' ? 'delete' : 'move'

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('sporthouse_document_folders')
    .select('section, parent_id, drive_folder_id')
    .eq('id', id)
    .single()

  if (!target) return new Response('Not found', { status: 404 })
  if (!canManageSection(user, target.section as SporthouseSection)) {
    return new Response('Forbidden', { status: 403 })
  }

  // Move every document in this folder and its soon-to-be-cascade-deleted
  // subfolders up to the parent, in Drive as well as in the database —
  // otherwise the recursive Drive folder delete below would take them along.
  const affectedFolderIds = await collectFolderIds(admin, id)
  const { data: affected } = await admin
    .from('sporthouse_documents')
    .select('id, drive_file_id')
    .in('folder_id', affectedFolderIds)

  if (affected?.length) {
    try {
      const parentDriveFolderId = await resolveSporthouseDriveFolderId(
        admin,
        target.section as SporthouseSection,
        target.parent_id
      )
      await Promise.allSettled(
        affected
          .filter(d => d.drive_file_id)
          .map(d => mode === 'delete'
            ? trashAndMoveFile(d.drive_file_id!, parentDriveFolderId)
            : moveFile(d.drive_file_id!, parentDriveFolderId))
      )
    } catch (err) {
      console.error('Drive document move-to-parent error:', err)
    }

    const updatePayload = mode === 'delete'
      ? { folder_id: target.parent_id, deleted_at: new Date().toISOString(), deleted_by: user.email }
      : { folder_id: target.parent_id }
    await admin.from('sporthouse_documents').update(updatePayload).in('folder_id', affectedFolderIds)
  }

  const { error } = await admin.from('sporthouse_document_folders').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })

  if (target.drive_folder_id) {
    try { await deleteDriveFolder(target.drive_folder_id) }
    catch (err) { console.error('Drive folder delete error:', err) }
  }

  return new Response(null, { status: 204 })
}
