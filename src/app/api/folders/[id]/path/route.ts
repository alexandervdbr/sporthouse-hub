import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasClientAccess } from '@/lib/auth-permissions'
import { getSessionUser } from '@/lib/supabase/claims'

export const maxDuration = 30

interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  client_id: string
}

// Climbing more levels than this means the data is wrong, not that someone
// built a very deep tree — stop rather than loop forever on a cycle.
const MAX_DEPTH = 50

// The chain of folders from the root down to this one, so a link that points
// straight at a subfolder can draw its breadcrumbs. Without it a shared link
// could open the right contents under a breadcrumb that claimed you were
// somewhere else — the exact mismatch that made folder navigation unusable
// before.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  // Read path: the token is verified locally rather than confirmed with the
  // Auth server — see lib/supabase/claims.
  const user = await getSessionUser(supabase)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const trail: { id: string; name: string }[] = []
  let cursor: string | null = id

  for (let depth = 0; cursor && depth < MAX_DEPTH; depth++) {
    const { data: row }: { data: FolderRow | null } = await admin
      .from('file_folders')
      .select('id, name, parent_id, client_id')
      .eq('id', cursor)
      .single()

    if (!row) break
    // Checked on every level, not just the one asked for: a folder is only
    // yours to see if its whole chain is.
    if (!hasClientAccess(user, row.client_id)) {
      return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
    }
    trail.unshift({ id: row.id, name: row.name })
    cursor = row.parent_id
  }

  if (trail.length === 0) {
    return NextResponse.json({ error: 'Map niet gevonden.' }, { status: 404 })
  }

  return NextResponse.json({ trail })
}
