import { NextResponse } from 'next/server'
import { fetchThumbnail, type ThumbnailSize } from '@/lib/drive-storage'

// Every feature that stores files in Drive needs the same thumbnail endpoint:
// Google's own thumbnailLink is session-bound and 403s within about a day, so
// it can never be handed to a browser directly. What differs per feature is
// only which table the row lives in and who's allowed to see it — so the
// routes keep their own access rules (next to the table they guard) and share
// everything below.

export function thumbnailSizeFromRequest(request: Request): ThumbnailSize {
  // Anything but an explicit 'small' means the viewer-sized image, so a
  // typo'd or missing value degrades to a correct (if larger) response.
  return new URL(request.url).searchParams.get('size') === 'small' ? 'small' : 'large'
}

export async function driveThumbnailResponse(
  driveFileId: string,
  size: ThumbnailSize
): Promise<NextResponse> {
  try {
    const thumb = await fetchThumbnail(driveFileId, size)
    if (!thumb) {
      return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
    }
    return new NextResponse(thumb.body, {
      headers: {
        'Content-Type': thumb.contentType,
        // The rendered preview of a given Drive file never changes, and every
        // route keys its URL by a row id, so this is safe to keep for good —
        // that's what makes revisiting a file instant.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Kon thumbnail niet ophalen:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kon voorbeeld niet ophalen.' }, { status: 500 })
  }
}
