import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import { driveThumbnailResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'
import { getSessionUser } from '@/lib/supabase/claims'

export const maxDuration = 60

// Like the download route beside it, the section permission is re-checked on
// every read — these documents are never shared publicly in Drive.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
    // Read path: the token is verified locally instead of being confirmed with
  // the Auth server on every call — see lib/supabase/claims. Writes in this
  // file still use getUser().
  const user = await getSessionUser(supabase)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, drive_file_id')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canViewSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }
  if (doc.storage_provider !== 'drive' || !doc.drive_file_id) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  return driveThumbnailResponse(doc.drive_file_id, thumbnailSizeFromRequest(request))
}
