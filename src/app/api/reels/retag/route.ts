import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { classifyReel } from '@/lib/reel-classification'

export const maxDuration = 60

// One-off bulk re-classification for rows saved before media_type / richer
// tags existed. Runs synchronously and returns a count — fine at the
// current scale (a handful of rows); if the board grows into the hundreds
// this would need to move to a background job instead of a single request.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: reels, error } = await admin
    .from('reel_inspiration')
    .select('id, url, caption, author, thumbnail_url')

  if (error) return new Response(error.message, { status: 500 })

  let updated = 0
  for (const reel of reels ?? []) {
    const classification = await classifyReel({
      url: reel.url,
      caption: reel.caption,
      authorName: reel.author,
      thumbnailUrl: reel.thumbnail_url,
    })

    const { error: updateError } = await admin
      .from('reel_inspiration')
      .update({
        category: classification.category,
        media_type: classification.mediaType,
        tags: classification.tags,
        confidence: classification.confidence,
        status: 'done',
      })
      .eq('id', reel.id)

    if (!updateError) updated++
  }

  return Response.json({ updated, total: reels?.length ?? 0 })
}
