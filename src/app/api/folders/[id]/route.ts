import { createClient, createAdminClient } from '@/lib/supabase/server'
import { renameDriveFolder, trashDriveFolder, moveFile, trashAndMoveFile } from '@/lib/drive-storage'
import { resolveDriveFolderId } from '@/lib/client-files-drive'
import type { SupabaseClient } from '@supabase/supabase-js'

// Collects a folder's id plus every descendant subfolder id (breadth-first),
// so a delete can account for files anywhere in the subtree being removed.
async function collectFolderIds(admin: SupabaseClient, rootId: string): Promise<string[]> {
  const ids = [rootId]
  let frontier = [rootId]
  while (frontier.length) {
    const { data: children } = await admin.from('file_folders').select('id').in('parent_id', frontier)
    const childIds = (children ?? []).map(c => c.id as string)
    if (!childIds.length) break
    ids.push(...childIds)
    frontier = childIds
  }
  return ids
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return new Response('name required', { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin.from('file_folders').select('drive_folder_id').eq('id', id).single()

  const { data, error } = await admin
    .from('file_folders')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Best-effort mirror — a folder with no drive_folder_id yet just hasn't
  // had its first upload, so there's nothing in Drive to rename yet.
  if (existing?.drive_folder_id) {
    try { await renameDriveFolder(existing.drive_folder_id, name.trim()) }
    catch (err) { console.error('Drive folder rename error:', err) }
  }

  return Response.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  // 'delete': files go to the trash (recoverable for 30 days, same as a
  // normal file delete). 'move' (default, for older clients): files are
  // relocated to the parent folder untouched, same as the original behavior.
  const mode = new URL(req.url).searchParams.get('mode') === 'delete' ? 'delete' : 'move'

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('file_folders')
    .select('client_id, parent_id, drive_folder_id')
    .eq('id', id)
    .single()

  if (!target) return new Response('Not found', { status: 404 })

  // Relocate every file in this folder (and any nested subfolders about to be
  // cascade-deleted) up to the parent — including the actual Drive files,
  // which would otherwise be destroyed for good by the recursive Drive
  // folder delete below. In 'delete' mode they're also trashed at the same
  // time, so they land in the parent's Prullenbak instead of surviving there
  // untouched.
  const affectedFolderIds = await collectFolderIds(admin, id)
  const { data: affectedFiles } = await admin
    .from('files')
    .select('id, drive_file_id')
    .in('folder_id', affectedFolderIds)

  if (affectedFiles?.length) {
    const { data: client } = await admin.from('clients').select('name').eq('id', target.client_id).single()
    if (client) {
      try {
        const parentDriveFolderId = await resolveDriveFolderId(admin, target.client_id, client.name, target.parent_id)
        await Promise.allSettled(
          affectedFiles
            .filter(f => f.drive_file_id)
            .map(f => mode === 'delete'
              ? trashAndMoveFile(f.drive_file_id!, parentDriveFolderId)
              : moveFile(f.drive_file_id!, parentDriveFolderId))
        )
      } catch (err) {
        console.error('Drive file move-to-parent error:', err)
      }
    }
    const updatePayload = mode === 'delete'
      ? { folder_id: target.parent_id, deleted_at: new Date().toISOString(), deleted_by: user.email }
      : { folder_id: target.parent_id }
    await admin.from('files').update(updatePayload).in('folder_id', affectedFolderIds)
  }

  // Delete folder — subfolder rows cascade due to ON DELETE CASCADE
  const { error } = await admin.from('file_folders').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })

  if (target.drive_folder_id) {
    try { await trashDriveFolder(target.drive_folder_id) }
    catch (err) { console.error('Drive folder delete error:', err) }
  }

  return new Response(null, { status: 204 })
}
