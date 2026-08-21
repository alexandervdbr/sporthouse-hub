import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/drive-storage'

export const maxDuration = 60

// Streams a Drive-stored reel thumbnail through our own service account
// instead of using Google's thumbnailLink directly — that link turned out to
// be short-lived/session-bound (confirmed: it 403s within ~a day), so it was
// never actually a fix for the original "thumbnail URL expires" problem,
// just a different expiring URL. Same fix pattern as /api/files/download.
// The image itself never changes for a given Drive file id, so this is
// cached aggressively both client- and CDN-side.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ driveId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { driveId } = await params

  try {
    const stream = await downloadFile(driveId)
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Kon reel-thumbnail niet streamen:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kon thumbnail niet ophalen.' }, { status: 500 })
  }
}
