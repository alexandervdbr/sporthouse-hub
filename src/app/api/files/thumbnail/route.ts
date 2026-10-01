import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { hasClientAccess } from '@/lib/auth-permissions'
import { driveThumbnailResponse, drivePosterResponse, thumbnailSizeFromRequest } from '@/lib/thumbnail-response'

export const maxDuration = 60

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Drive's rendered preview for a client file. Same auth and per-client access
// check as the download route next to it.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = adminClient()
  const { data: file } = await admin
    .from('files')
    .select('drive_file_id, client_id, poster_drive_file_id')
    .eq('id', id)
    .single()

  if (!file?.drive_file_id) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  // Our own captured frame wins over Drive's render when we have one.
  if (file.poster_drive_file_id) return drivePosterResponse(file.poster_drive_file_id)

  return driveThumbnailResponse(file.drive_file_id, thumbnailSizeFromRequest(request))
}
