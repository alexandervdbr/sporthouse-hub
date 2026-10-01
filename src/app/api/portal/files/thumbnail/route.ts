import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'

export const maxDuration = 60

// A freelancer's own assignment file. The join on freelancer_id is the access
// check: a file belonging to someone else simply isn't found, exactly as in
// the download route one level up.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const fileId = new URL(request.url).searchParams.get('id')
  if (!fileId) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) return NextResponse.json({ error: 'Geen freelancer-account.' }, { status: 403 })

  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('storage_provider, drive_file_id, freelancer_assignments!inner(freelancer_id)')
    .eq('id', fileId)
    .eq('freelancer_assignments.freelancer_id', freelancer.id)
    .maybeSingle()

  if (file?.storage_provider !== 'drive' || !file.drive_file_id) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  return driveThumbnailResponse(file.drive_file_id, thumbnailSizeFromRequest(request))
}
