import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { downloadFileWithMeta, downloadFileRange } from '@/lib/drive-storage'
import { hasClientAccess } from '@/lib/auth-permissions'
import { inlineMimeType } from '@/lib/upload-policy'

// Streaming a large file through a function is bounded by this. Left at 300:
// raising it to the 800 that Fluid Compute can allow made the Vercel build
// fail, so the ceiling this plan accepts is lower — and guessing at it costs
// a broken deploy every time.
//
// It matters less than it looks. A download that gets cut off here can now be
// resumed, because the response carries its length and accepts ranges; the
// browser simply asks for the rest. That only started working in #166, which
// is why this used to be the whole story and no longer is.
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

  // `inline=1` asks the browser to play the file in place instead of saving
  // it — used by the viewer's own video player. Only honoured for media types
  // (see inlineMimeType); everything else stays a download, because serving
  // an arbitrary upload inline would run it in our origin.
  const wantsInline = searchParams.get('inline') === '1'
  const inlineType = wantsInline ? inlineMimeType(file.file_type ?? '') : null

  const contentType = inlineType ?? 'application/octet-stream'
  const disposition = inlineType
    ? 'inline'
    : `attachment; filename="${encodeURIComponent(file.filename)}"`
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
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      }
      if (part.contentRange) headers['Content-Range'] = part.contentRange
      if (part.contentLength) headers['Content-Length'] = part.contentLength
      return new NextResponse(webStream, { status: part.partial ? 206 : 200, headers })
    }

    const full = await downloadFileWithMeta(file.drive_file_id)
    const webStream = Readable.toWeb(full.stream as Readable) as ReadableStream
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'X-Content-Type-Options': 'nosniff',
      // Advertised on the full response too — it's how a browser or
      // download manager learns it may ask for slices at all.
      'Accept-Ranges': 'bytes',
    }
    // Taken from Drive rather than our own file_size column, so it can't
    // disagree with the bytes actually being sent.
    if (full.contentLength) headers['Content-Length'] = full.contentLength
    return new NextResponse(webStream, { headers })
  } catch (err) {
    console.error('Drive download error:', err)
    return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
  }
}
