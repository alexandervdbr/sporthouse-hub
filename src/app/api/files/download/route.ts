import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { downloadFile, downloadFileRange } from '@/lib/drive-storage'
import { hasClientAccess } from '@/lib/auth-permissions'

export const maxDuration = 300

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Streams a Drive-stored file through our own service account instead of
// relying on Google's public webContentLink — avoids the "can't scan for
// viruses" interstitial Google shows for larger files on that link.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = adminClient()
  const { data: file } = await admin
    .from('files')
    .select('drive_file_id, filename, file_type, client_id')
    .eq('id', id)
    .single()

  if (!file?.drive_file_id) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  const disposition = `attachment; filename="${encodeURIComponent(file.filename)}"`
  const range = request.headers.get('range')

  try {
    // Ranges matter here beyond politeness: this streams through a function
    // with a hard duration limit, so a large file on a slow connection can't
    // finish in one go. Bounded slices each fit, and a dropped connection
    // resumes instead of starting over.
    if (range) {
      const part = await downloadFileRange(file.drive_file_id, range)
      const webStream = Readable.toWeb(part.stream as Readable) as ReadableStream
      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': disposition,
        'Accept-Ranges': 'bytes',
      }
      if (part.contentRange) headers['Content-Range'] = part.contentRange
      if (part.contentLength) headers['Content-Length'] = part.contentLength
      return new NextResponse(webStream, { status: part.partial ? 206 : 200, headers })
    }

    const stream = await downloadFile(file.drive_file_id)
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': disposition,
        // Advertised on the full response too — it's how a browser or
        // download manager learns it may ask for slices at all.
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (err) {
    console.error('Drive download error:', err)
    return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
  }
}
