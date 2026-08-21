import { uploadFile, trashFile, downloadFile, getOrCreateFolderPath, driveRootFolderId, isDriveStorageConfigured } from '@/lib/drive-storage'

// Our own proxy (GET /api/reels/thumbnail/[driveId]), not Drive's own
// thumbnailLink — that turned out to be short-lived/session-bound (403s
// within about a day), so it was never actually a fix for "the thumbnail
// URL expires", just a different expiring URL. Streaming the file
// ourselves via the service account is the only stable option; the
// existing /api/files/download route hit the same lesson earlier.
export function driveThumbnailProxyUrl(driveId: string): string {
  return `/api/reels/thumbnail/${driveId}`
}

// Instagram's CDN thumbnail URLs are signed and expire a few days after
// being fetched — re-hosting on Drive (same storage layer every other
// file-based feature in this app already uses) gives a saved reel a
// thumbnail that doesn't quietly 404 a few days later. Best-effort: on any
// failure the caller just keeps using the original (eventually-expiring)
// Instagram URL rather than failing the whole classification pass over it.
export async function hostThumbnailOnDrive(
  sourceUrl: string,
  reelId: string
): Promise<{ thumbnailUrl: string; driveId: string } | null> {
  if (!isDriveStorageConfigured()) return null

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const buffer = Buffer.from(await res.arrayBuffer())

    const folderId = await getOrCreateFolderPath(['Mijn gedacht — thumbnails'], driveRootFolderId()!)
    const uploaded = await uploadFile(buffer, `${reelId}.jpg`, contentType, folderId)

    return { thumbnailUrl: driveThumbnailProxyUrl(uploaded.id), driveId: uploaded.id }
  } catch (err) {
    console.error('Kon reel-thumbnail niet naar Drive uploaden:', err instanceof Error ? err.message : err)
    return null
  }
}

// Used by classifyReel to read a Drive-hosted thumbnail directly through the
// service account (in-process, no HTTP round-trip to our own proxy route —
// that route requires a browser session cookie, which a server-to-server
// classification call doesn't have).
export async function fetchDriveThumbnailAsBase64(driveId: string): Promise<{ mediaType: 'image/jpeg'; data: string } | null> {
  try {
    const stream = await downloadFile(driveId)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return { mediaType: 'image/jpeg', data: Buffer.concat(chunks).toString('base64') }
  } catch (err) {
    console.error('Kon Drive-thumbnail niet ophalen voor classificatie:', err instanceof Error ? err.message : err)
    return null
  }
}

// Content-manager (not Manager) service account role — files.delete() 404s
// outright on this Drive, trashing is the only removal path that works.
export async function removeThumbnailFromDrive(driveId: string) {
  try {
    await trashFile(driveId)
  } catch (err) {
    console.error('Kon Drive-thumbnail niet verwijderen:', err instanceof Error ? err.message : err)
  }
}
