import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { classifyReel } from '@/lib/reel-classification'
import { hostThumbnailOnDrive, driveThumbnailProxyUrl } from '@/lib/reel-thumbnail-storage'

export const maxDuration = 60

// A handful at a time — fast enough to matter once the board is in the
// dozens of rows, gentle enough not to hammer the Anthropic/Drive APIs.
const CONCURRENCY = 3

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<boolean>): Promise<number> {
  let updated = 0
  let index = 0

  async function worker() {
    while (index < items.length) {
      const item = items[index++]
      if (await fn(item)) updated++
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return updated
}

// One-off bulk re-classification — for rows saved before media_type/richer
// tags existed, or that never got a permanent Drive-hosted thumbnail. Runs
// synchronously and returns a count; fine at the current scale (a handful of
// rows), would need to move to a background job if the board grows into the
// hundreds.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: reels, error } = await admin
    .from('reel_inspiration')
    .select('id, url, caption, author, thumbnail_url, thumbnail_drive_id')

  if (error) return new Response(error.message, { status: 500 })

  const updated = await mapWithConcurrency(reels ?? [], CONCURRENCY, async (reel) => {
    // Already hosted on Drive — no re-upload needed, just repoint at our own
    // proxy (fixes rows still carrying the old, now-403ing thumbnailLink URL
    // from before that was corrected). Otherwise host it for the first time.
    const hosted = reel.thumbnail_drive_id
      ? { thumbnailUrl: driveThumbnailProxyUrl(reel.thumbnail_drive_id), driveId: reel.thumbnail_drive_id }
      : reel.thumbnail_url
        ? await hostThumbnailOnDrive(reel.thumbnail_url, reel.id)
        : null

    const classification = await classifyReel({
      url: reel.url,
      caption: reel.caption,
      authorName: reel.author,
      thumbnailUrl: hosted?.thumbnailUrl ?? reel.thumbnail_url,
    })

    const { error: updateError } = await admin
      .from('reel_inspiration')
      .update({
        category: classification.category,
        media_type: classification.mediaType,
        tags: classification.tags,
        confidence: classification.confidence,
        ...(hosted ? { thumbnail_url: hosted.thumbnailUrl, thumbnail_drive_id: hosted.driveId } : {}),
        status: 'done',
      })
      .eq('id', reel.id)

    return !updateError
  })

  return Response.json({ updated, total: reels?.length ?? 0 })
}
