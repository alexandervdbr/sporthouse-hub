import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchInstagramOembed, InstagramOembedError } from '@/lib/instagram-oembed'
import { classifyReel } from '@/lib/reel-classification'

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

  const url = body.url?.trim()
  if (!url) return Response.json({ status: 'error', message: 'url is verplicht.' }, { status: 400 })

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
    const classification = await classifyReel({
      caption: oembed.title,
      authorName: oembed.authorName,
      thumbnailUrl: oembed.thumbnailUrl,
    })

    await admin
      .from('reel_inspiration')
      .update({
        category: classification.category,
        tags: classification.tags,
        confidence: classification.confidence,
        status: 'done',
      })
      .eq('id', row.id)
  })

  return Response.json({ status: 'ok', id: row.id })
}
