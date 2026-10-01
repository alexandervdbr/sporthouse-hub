import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasSection } from '@/lib/auth-permissions'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'

export const maxDuration = 60

// Drive's rendered preview for a Pré-Assist submission. Mirrors the section
// check on the download route beside it.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasSection(user, 'preassist')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('preassist_submissions')
    .select('drive_file_id')
    .eq('id', id)
    .single()

  if (!submission?.drive_file_id) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  return driveThumbnailResponse(submission.drive_file_id, thumbnailSizeFromRequest(request))
}
