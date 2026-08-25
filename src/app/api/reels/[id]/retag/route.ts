import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { retagReel } from '@/lib/reel-retag'

export const maxDuration = 60

// Manual "reclassify this one" — admin-only (see the settings-panel gate on
// the page itself). Unlike the bulk retag route, this always forces a fresh
// classification even if the item already has tags, since the
// whole point is to redo it (after a prompt tweak, or because the AI got it
// wrong the first time) rather than skip it as "already done".
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: reel, error } = await admin
    .from('reel_inspiration')
    .select('id, url, caption, author, media_types, tags, thumbnail_url, thumbnail_drive_id')
    .eq('id', id)
    .single()

  if (error || !reel) return new Response('Niet gevonden.', { status: 404 })

  const result = await retagReel(admin, reel, { forceReclassify: true })
  if (!result.row) return new Response('Herclassificeren mislukt.', { status: 500 })

  return Response.json(result.row)
}
