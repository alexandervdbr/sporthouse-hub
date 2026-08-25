import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { retagReel } from '@/lib/reel-retag'

// Bumped from 60: reels with an extractable video now take meaningfully
// longer per row (video fetch + several ffmpeg frame extractions) than the
// old single-thumbnail path, still comfortably inside the platform's 300s
// ceiling.
export const maxDuration = 120

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
// every row regardless of whether it needed it was almost certainly why a
// full pass previously got cut off mid-batch by the platform's own timeout,
// leaving whatever hadn't been reached yet still broken.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: reels, error } = await admin
    .from('reel_inspiration')
    .select('id, url, caption, author, media_types, tags, thumbnail_url, thumbnail_drive_id')

  if (error) return new Response(error.message, { status: 500 })

  let repaired = 0
  let reclassified = 0

  await forEachWithConcurrency(reels ?? [], CONCURRENCY, async (reel) => {
    const result = await retagReel(admin, reel)
    if (result.repaired) repaired++
    if (result.reclassified) reclassified++
  })

  return Response.json({ repaired, reclassified, total: reels?.length ?? 0 })
}
