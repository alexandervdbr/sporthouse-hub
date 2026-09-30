import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { fetchThumbnail } from '@/lib/drive-storage'
import { hasClientAccess } from '@/lib/auth-permissions'

export const maxDuration = 60

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Serves Drive's rendered preview image for a file, so the viewer can show a
// PSD or a video's poster frame as a plain <img> instead of loading Google's
// preview app in an iframe for every step through a folder.
//
// Proxied rather than linked because Drive's own thumbnailLink expires within
// about a day — see fetchThumbnail. Same auth and per-client access check as
// the download route next to it.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = adminClient()
  const { data: file } = await admin
    .from('files')
    .select('drive_file_id, client_id')
    .eq('id', id)
    .single()

  if (!file?.drive_file_id) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  try {
    const thumb = await fetchThumbnail(file.drive_file_id)
    if (!thumb) {
      return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
    }
    return new NextResponse(thumb.body, {
      headers: {
        'Content-Type': thumb.contentType,
        // The rendered preview of a given Drive file never changes, and the
        // URL is keyed by that file's row id, so this is safe to keep for
        // good — that's what makes stepping back and forth instant.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Kon thumbnail niet ophalen:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kon voorbeeld niet ophalen.' }, { status: 500 })
  }
}
