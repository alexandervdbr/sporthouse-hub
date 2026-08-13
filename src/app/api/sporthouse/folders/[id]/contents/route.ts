import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import type { SupabaseClient } from '@supabase/supabase-js'

interface FolderNode {
  id: string
  path: string // path relative to the root folder, '' for the root itself
}

async function collectFolderTree(admin: SupabaseClient, rootId: string): Promise<FolderNode[]> {
  const nodes: FolderNode[] = [{ id: rootId, path: '' }]
  let frontier = nodes
  while (frontier.length) {
    const { data: children } = await admin
      .from('sporthouse_document_folders')
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: root } = await admin
    .from('sporthouse_document_folders')
    .select('id, name, section')
    .eq('id', id)
    .single()

  if (!root) return NextResponse.json({ error: 'Map niet gevonden.' }, { status: 404 })
  if (!canViewSection(user, root.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const nodes = await collectFolderTree(admin, root.id)
  const pathById = new Map(nodes.map(n => [n.id, n.path]))

  const { data: docRows } = await admin
    .from('sporthouse_documents')
    .select('id, filename, folder_id')
    .in('folder_id', nodes.map(n => n.id))
    .is('deleted_at', null)

  const files = (docRows ?? []).map(d => {
    const prefix = pathById.get(d.folder_id!) ?? ''
    return { id: d.id, filename: d.filename, relativePath: prefix ? `${prefix}/${d.filename}` : d.filename }
  })

  return NextResponse.json({ folderName: root.name, files })
}
