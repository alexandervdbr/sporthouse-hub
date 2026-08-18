import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isReelCategory } from '@/lib/reel-categories'
import { isReelMediaType } from '@/lib/reel-media-types'

// reel_inspiration has no authenticated update/delete RLS policy — it's a
// shared team board (see the migration), so any logged-in user may correct
// the AI's classification or remove an entry. Uses the admin client to
// bypass RLS rather than adding policies for this.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return new Response('Ongeldige aanvraag.', { status: 400 })

  const update: Record<string, unknown> = {}

  if ('category' in body) {
    if (body.category !== null && !isReelCategory(body.category)) {
      return new Response('Ongeldige categorie.', { status: 400 })
    }
    update.category = body.category
  }

  if ('media_type' in body) {
    if (body.media_type !== null && !isReelMediaType(body.media_type)) {
      return new Response('Ongeldig type.', { status: 400 })
    }
    update.media_type = body.media_type
  }

  if ('tags' in body) {
    if (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === 'string')) {
      return new Response('Ongeldige tags.', { status: 400 })
    }
    update.tags = body.tags.map((t: string) => t.trim()).filter(Boolean).slice(0, 30)
  }

  if (Object.keys(update).length === 0) return new Response('Niets om op te slaan.', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('reel_inspiration').update(update).eq('id', id).select().single()
  if (error) return new Response(error.message, { status: 500 })

  return Response.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('reel_inspiration').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}
