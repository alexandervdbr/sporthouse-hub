import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canViewFreelancers } from '@/features/freelancers/lib/access'
import { isUuid } from '@/features/freelancers/lib/server'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'
import { getSessionUser } from '@/lib/supabase/claims'

export const maxDuration = 60

// Staff-facing counterpart to /api/portal/files/thumbnail — same files, seen
// from the staff side: "bekijken" is enough, and the lookup is scoped to the
// assignment AND the freelancer in the URL.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const supabase = await createClient()
    // Read path: the token is verified locally instead of being confirmed with
  // the Auth server on every call — see lib/supabase/claims. Writes in this
  // file still use getUser().
  const user = await getSessionUser(supabase)
  if (!user || !canViewFreelancers(user)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const { id, assignmentId } = await params
  const fileId = new URL(request.url).searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId ontbreekt.' }, { status: 400 })
  if (!isUuid(id) || !isUuid(assignmentId) || !isUuid(fileId)) {
    return NextResponse.json({ error: 'Niet gevonden.' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('storage_provider, drive_file_id, freelancer_assignments!inner(freelancer_id)')
    .eq('id', fileId)
    .eq('assignment_id', assignmentId)
    .eq('freelancer_assignments.freelancer_id', id)
    .maybeSingle()

  if (file?.storage_provider !== 'drive' || !file.drive_file_id) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  return driveThumbnailResponse(file.drive_file_id, thumbnailSizeFromRequest(request))
}
