import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { classifyReel } from '@/lib/reel-classification'
import { hostThumbnailOnDrive, driveThumbnailProxyUrl } from '@/lib/reel-thumbnail-storage'

export const maxDuration = 60

// A handful at a time — fast enough to matter once the board is in the
// dozens of rows, gentle enough not to hammer the Anthropic/Drive APIs.
const CONCURRENCY = 3

async function forEachWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function worker() {
    while (index < items.length) await fn(items[index++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

// Repairs thumbnail hosting for every row (cheap — no Anthropic call, and a
// no-op for rows already pointing at our own proxy) and re-runs the AI
// classifier only for rows that actually still need it. Only reprocessing
// what's broken, instead of every row on every click, keeps this well
// inside the 60s function limit even as the board grows — running it over
// all 13 rows regardless of whether they needed it was almost certainly why
// a full pass previously got cut off mid-batch by the platform's own
// timeout, leaving whatever hadn't been reached yet still broken.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: reels, error } = await admin
    .from('reel_inspiration')
    .select('id, url, caption, author, category, tags, thumbnail_url, thumbnail_drive_id')

  if (error) return new Response(error.message, { status: 500 })

  let repaired = 0
  let reclassified = 0

  await forEachWithConcurrency(reels ?? [], CONCURRENCY, async (reel) => {
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

    const needsClassification = !reel.category || reel.tags.length === 0
    if (needsClassification) {
      const classification = await classifyReel({
        url: reel.url,
        caption: reel.caption,
        authorName: reel.author,
        thumbnailUrl: (update.thumbnail_url as string | undefined) ?? reel.thumbnail_url,
      })
      update.category = classification.category
      update.media_type = classification.mediaType
      update.tags = classification.tags
      update.confidence = classification.confidence
      update.status = 'done'
    }

    if (Object.keys(update).length === 0) return

    const { error: updateError } = await admin.from('reel_inspiration').update(update).eq('id', reel.id)
    if (updateError) return
    if ('thumbnail_url' in update) repaired++
    if (needsClassification) reclassified++
  })

  return Response.json({ repaired, reclassified, total: reels?.length ?? 0 })
}
