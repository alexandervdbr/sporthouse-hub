import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import { getSessionUser } from '@/lib/supabase/claims'

export const maxDuration = 30

const MAX_DEPTH = 50

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  section: string
}

// The chain of folders down to this one, so a link straight to a subfolder
// can draw its breadcrumbs. Twin of the one under /api/folders; the section
// permission is checked on every level rather than only the one asked for.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  // Read path: the token is verified locally — see lib/supabase/claims.
  const user = await getSessionUser(supabase)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const trail: { id: string; name: string }[] = []
  let cursor: string | null = id

  for (let depth = 0; cursor && depth < MAX_DEPTH; depth++) {
    const { data: row }: { data: FolderRow | null } = await admin
      .from('sporthouse_document_folders')
      .select('id, name, parent_id, section')
      .eq('id', cursor)
      .single()

    if (!row) break
    if (!canViewSection(user, row.section as SporthouseSection)) {
      return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
    }
    trail.unshift({ id: row.id, name: row.name })
    cursor = row.parent_id
  }

  if (trail.length === 0) {
    return NextResponse.json({ error: 'Map niet gevonden.' }, { status: 404 })
  }

  return NextResponse.json({ trail })
}
