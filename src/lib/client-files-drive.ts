import { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateFolder, driveRootFolderId } from '@/lib/drive-storage'

// Resolves (and lazily creates) the Drive folder for a given file_folders id,
// mirroring the folder's full ancestor chain into real Drive subfolders under
// Klant-documenten / {client}. Persists drive_folder_id on each ancestor row
// as it's resolved, so later renames/deletes/moves only need one lookup.
// Shared by the files upload/move routes and the folder delete route.
//
// Every row in the chain is required to actually belong to clientId — a
// caller passing a folderId from a different client (deliberately or by a
// bug) would otherwise get its real, cached Drive folder handed back
// (level.drive_folder_id, below) despite operating under the "wrong"
// clientId, misfiling a file into another client's real folder tree.
export async function resolveDriveFolderId(
  admin: SupabaseClient,
  clientId: string,
  clientName: string,
  folderId: string | null
): Promise<string> {
  const chain: { id: string; name: string; drive_folder_id: string | null }[] = []
  let cursor = folderId
  while (cursor) {
    const { data: row } = await admin
      .from('file_folders')
      .select('id, name, parent_id, drive_folder_id, client_id')
      .eq('id', cursor)
      .single()
    if (!row) break
    if (row.client_id !== clientId) {
      throw new Error(`Folder ${row.id} behoort niet tot client ${clientId}`)
    }
    chain.unshift({ id: row.id, name: row.name, drive_folder_id: row.drive_folder_id })
    cursor = row.parent_id
  }

  let parentId = await getOrCreateFolder('Klant-documenten', driveRootFolderId()!)
  parentId = await getOrCreateFolder(clientName, parentId)

  for (const level of chain) {
    if (level.drive_folder_id) {
      parentId = level.drive_folder_id
      continue
    }
    parentId = await getOrCreateFolder(level.name, parentId)
    await admin.from('file_folders').update({ drive_folder_id: parentId }).eq('id', level.id)
  }

  return parentId
}
