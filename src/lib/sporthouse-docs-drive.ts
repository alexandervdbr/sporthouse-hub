import { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateFolder, sporthouseRootFolderId } from '@/lib/drive-storage'
import type { SporthouseSection } from '@/lib/sporthouse-docs'

// Tegenhanger van resolveDriveFolderId voor klantbestanden, maar tegen de
// afgeschermde "Sporthouse Intern"-drive: spiegelt de mappenketen van een
// sporthouse_document_folders-rij naar echte Drive-submappen onder
// Sporthouse Intern / {section}, en onthoudt drive_folder_id per niveau zodat
// latere uploads/verplaatsingen maar één lookup nodig hebben.
export async function resolveSporthouseDriveFolderId(
  admin: SupabaseClient,
  section: SporthouseSection,
  folderId: string | null
): Promise<string> {
  const chain: { id: string; name: string; drive_folder_id: string | null }[] = []
  let cursor = folderId
  while (cursor) {
    const { data: row } = await admin
      .from('sporthouse_document_folders')
      .select('id, name, parent_id, drive_folder_id')
      .eq('id', cursor)
      .single()
    if (!row) break
    chain.unshift({ id: row.id, name: row.name, drive_folder_id: row.drive_folder_id })
    cursor = row.parent_id
  }

  let parentId = await getOrCreateFolder(section, sporthouseRootFolderId()!)

  for (const level of chain) {
    if (level.drive_folder_id) {
      parentId = level.drive_folder_id
      continue
    }
    parentId = await getOrCreateFolder(level.name, parentId)
    await admin.from('sporthouse_document_folders').update({ drive_folder_id: parentId }).eq('id', level.id)
  }

  return parentId
}
