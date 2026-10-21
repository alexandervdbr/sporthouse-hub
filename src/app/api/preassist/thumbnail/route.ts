import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasOpenSection } from '@/lib/auth-permissions'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'
import { getSessionUser } from '@/lib/supabase/claims'

export const maxDuration = 60

// Drive's rendered preview for a Pré-Assist submission. Mirrors the section
// check on the download route beside it.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
    // Read path: the token is verified locally instead of being confirmed with
  // the Auth server on every call — see lib/supabase/claims. Writes in this
  // file still use getUser().
  const user = await getSessionUser(supabase)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasOpenSection(user, 'preassist')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('preassist_submissions')
    .select('drive_file_id, thumbnail_drive_id')
    .eq('id', id)
    .single()

  // Een link heeft geen bestand in Drive, maar wel een thumbnail die we daar
  // zelf hebben neergezet — die van Instagram verloopt na een paar dagen.
  // Verder is het dezelfde weg: Drive rendert het voorbeeld, wij geven het door.
  const driveId = submission?.thumbnail_drive_id ?? submission?.drive_file_id
  if (!driveId) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  return driveThumbnailResponse(driveId, thumbnailSizeFromRequest(request))
}
