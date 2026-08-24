import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyReel } from './reel-classification'
import { hostThumbnailOnDrive, driveThumbnailProxyUrl } from './reel-thumbnail-storage'
import { getReelMediaTypes } from './reel-media-types'

interface ReelRow {
  id: string
  url: string
  caption: string | null
  author: string | null
  tags: string[]
  media_type: string | null
  thumbnail_url: string | null
  thumbnail_drive_id: string | null
}

// Shared by the bulk retag route (only rows missing a classification) and
// the per-item "herclassificeer" action (always forces a fresh pass) — one
// place for the repair-thumbnail-then-maybe-reclassify logic so the two
// don't drift apart.
export async function retagReel(
  admin: SupabaseClient,
  reel: ReelRow,
  options: { forceReclassify?: boolean } = {}
): Promise<{ repaired: boolean; reclassified: boolean; row: Record<string, unknown> | null }> {
  const update: Record<string, unknown> = {}

  if (reel.thumbnail_drive_id) {
    const proxied = driveThumbnailProxyUrl(reel.thumbnail_drive_id)
    if (reel.thumbnail_url !== proxied) update.thumbnail_url = proxied
  } else if (reel.thumbnail_url) {
    const hosted = await hostThumbnailOnDrive(reel.thumbnail_url, reel.id)
    if (hosted) {
      update.thumbnail_url = hosted.thumbnailUrl
      update.thumbnail_drive_id = hosted.driveId
    }
  }

  const needsClassification = options.forceReclassify || !reel.media_type || reel.tags.length === 0
  if (needsClassification) {
    const mediaTypes = await getReelMediaTypes(admin)
    const classification = await classifyReel({
      url: reel.url,
      caption: reel.caption,
      authorName: reel.author,
      thumbnailUrl: (update.thumbnail_url as string | undefined) ?? reel.thumbnail_url,
      mediaTypes,
    })
    update.media_type = classification.mediaType
    update.tags = classification.tags
    update.confidence = classification.confidence
    update.status = 'done'
  }

  if (Object.keys(update).length === 0) return { repaired: false, reclassified: false, row: null }

  const { data, error } = await admin.from('reel_inspiration').update(update).eq('id', reel.id).select().single()
  if (error) return { repaired: false, reclassified: false, row: null }

  return {
    repaired: 'thumbnail_url' in update,
    reclassified: needsClassification,
    row: data,
  }
}
