import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// reel_inspiration has no authenticated delete RLS policy — it's a shared
// team board (see the migration), so any logged-in user may remove an entry.
// Uses the admin client to bypass RLS rather than adding a delete policy.
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
