import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchInstagramOembed, InstagramOembedError } from '@/lib/instagram-oembed'
import { classifyReel } from '@/lib/reel-classification'
import { hostThumbnailOnDrive } from '@/lib/reel-thumbnail-storage'
import { getReelMediaTypes } from '@/lib/reel-media-types'

// Called by the iOS Share Sheet shortcut (and later the Android PWA share
// target) — no Supabase session, just a per-user bearer token. Excluded from
// the session-auth middleware, see src/lib/supabase/middleware.ts.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!token) return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: tokenRow } = await admin
    .from('user_api_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'error', message: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  // The iOS Share Sheet sometimes hands over the whole shared text block
  // (URL + a trailing description/username line) rather than a bare URL —
  // pull out just the URL rather than storing the raw blob.
  const urlMatch = body.url?.match(/https?:\/\/(?:www\.)?instagram\.com\/\S+/i)
  const url = urlMatch?.[0]
  if (!url) return Response.json({ status: 'error', message: 'url is verplicht.' }, { status: 400 })

  // Re-sharing the same post used to create a second card — bump it to the
  // top instead, and skip re-running oEmbed/classification for it.
  const { data: existing } = await admin
    .from('reel_inspiration')
    .select('id')
    .eq('url', url)
    .maybeSingle()

  if (existing) {
    await admin.from('reel_inspiration').update({ saved_at: new Date().toISOString() }).eq('id', existing.id)
    return Response.json({ status: 'ok', id: existing.id })
  }

  // oEmbed runs synchronously — it's what tells us the URL is actually a
  // valid, public Instagram post, and that needs to reach the phone's
  // "Saved" notification. Classification is slower (vision model call) and
  // its outcome isn't essential to "did this save?", so it runs after the
  // response via `after()` and the row starts as 'pending'.
  let oembed
  try {
    oembed = await fetchInstagramOembed(url)
  } catch (err) {
    const message = err instanceof InstagramOembedError ? err.message : 'Kon deze post niet ophalen.'
    return Response.json({ status: 'error', message }, { status: 422 })
  }

  const { data: row, error } = await admin
    .from('reel_inspiration')
    .insert({
      user_id: tokenRow.user_id,
      url,
      thumbnail_url: oembed.thumbnailUrl,
      caption: oembed.title,
      author: oembed.authorName,
      embed_html: oembed.html,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !row) {
    return Response.json({ status: 'error', message: 'Opslaan mislukt.' }, { status: 500 })
  }

  after(async () => {
    try {
      const mediaTypes = await getReelMediaTypes(admin)
      const classification = await classifyReel({
        url,
        caption: oembed.title,
        authorName: oembed.authorName,
        thumbnailUrl: oembed.thumbnailUrl,
        mediaTypes,
      })

      const hosted = oembed.thumbnailUrl ? await hostThumbnailOnDrive(oembed.thumbnailUrl, row.id) : null

      const { error: updateError } = await admin
        .from('reel_inspiration')
        .update({
          media_types: classification.mediaTypes,
          tags: classification.tags,
          confidence: classification.confidence,
          ...(hosted ? { thumbnail_url: hosted.thumbnailUrl, thumbnail_drive_id: hosted.driveId } : {}),
          status: 'done',
        })
        .eq('id', row.id)

      if (updateError) throw updateError
    } catch (err) {
      console.error('Reel achtergrondverwerking mislukt:', err instanceof Error ? err.message : err)
      try {
        await admin
          .from('reel_inspiration')
          .update({
            status: 'error',
            error_message: err instanceof Error ? err.message.slice(0, 500) : 'Onbekende fout.',
          })
          .eq('id', row.id)
      } catch {
        // Best-effort — if this also fails the row is stuck at 'pending',
        // same failure mode as before this change, not a regression.
      }
    }
  })

  return Response.json({ status: 'ok', id: row.id })
}
