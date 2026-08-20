import { uploadFile, trashFile, getOrCreateFolderPath, driveRootFolderId, isDriveStorageConfigured } from '@/lib/drive-storage'

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

    if (!uploaded.thumbnailLink) return null
    return { thumbnailUrl: uploaded.thumbnailLink, driveId: uploaded.id }
  } catch (err) {
    console.error('Kon reel-thumbnail niet naar Drive uploaden:', err instanceof Error ? err.message : err)
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
