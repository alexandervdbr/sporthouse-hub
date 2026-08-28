import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

// POST body: { order: Array<{ id: string; sort_order: number }> }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const { order } = await req.json() as { order: { id: string; sort_order: number }[] }
  if (!Array.isArray(order)) return new Response('order array required', { status: 400 })

  const admin = createAdminClient()

  // Update each channel's sort_order in parallel
  await Promise.all(
    order.map(({ id, sort_order }) =>
      admin.from('chat_channels').update({ sort_order }).eq('id', id)
    )
  )

  return new Response(null, { status: 204 })
}
