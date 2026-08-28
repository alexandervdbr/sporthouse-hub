import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import type { SupabaseClient } from '@supabase/supabase-js'

interface FolderNode {
  id: string
  path: string // relative path prefix within the root folder, '' for the root itself
}

// Walks the folder's full subtree breadth-first, building each descendant
// folder's path relative to the root — so files can be placed at the right
// nested location inside a downloaded zip.
async function collectFolderTree(admin: SupabaseClient, rootId: string): Promise<FolderNode[]> {
  const nodes: FolderNode[] = [{ id: rootId, path: '' }]
  let frontier = nodes
  while (frontier.length) {
    const { data: children } = await admin
      .from('file_folders')
      .select('id, name, parent_id')
      .in('parent_id', frontier.map(f => f.id))
    if (!children?.length) break
    const next: FolderNode[] = children.map(c => {
      const parent = frontier.find(f => f.id === c.parent_id)!
      return { id: c.id, path: parent.path ? `${parent.path}/${c.name}` : c.name }
    })
    nodes.push(...next)
    frontier = next
  }
  return nodes
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: root } = await admin.from('file_folders').select('id, name, client_id').eq('id', id).single()
  if (!root) return NextResponse.json({ error: 'Map niet gevonden.' }, { status: 404 })
  if (!hasClientAccess(user, root.client_id)) return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })

  const nodes = await collectFolderTree(admin, root.id)
  const pathById = new Map(nodes.map(n => [n.id, n.path]))

  const { data: fileRows } = await admin
    .from('files')
    .select('id, filename, folder_id')
    .in('folder_id', nodes.map(n => n.id))
    .is('deleted_at', null)

  const files = (fileRows ?? []).map(f => {
    const prefix = pathById.get(f.folder_id!) ?? ''
    return { id: f.id, filename: f.filename, relativePath: prefix ? `${prefix}/${f.filename}` : f.filename }
  })

  return NextResponse.json({ folderName: root.name, files })
}
