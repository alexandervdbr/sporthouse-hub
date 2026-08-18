import crypto from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

// Personal bearer token for the reel-inspiration shortcut, shown once on the
// settings page so the user can paste it into the Shortcut's Authorization
// header. Restricted to admins, same as the settings page itself — only the
// shortcut's own request to /api/save-reel uses this token afterwards.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('user_api_tokens')
    .select('token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return Response.json({ token: existing.token })

  const token = crypto.randomBytes(32).toString('hex')
  const { data, error } = await admin
    .from('user_api_tokens')
    .insert({ user_id: user.id, token })
    .select('token')
    .single()

  if (error || !data) return new Response('Kon token niet aanmaken.', { status: 500 })
  return Response.json({ token: data.token })
}

// Regenerate — invalidates the previous token (lost phone, leaked link, ...).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const token = crypto.randomBytes(32).toString('hex')

  const { data, error } = await admin
    .from('user_api_tokens')
    .upsert({ user_id: user.id, token }, { onConflict: 'user_id' })
    .select('token')
    .single()

  if (error || !data) return new Response('Kon token niet vernieuwen.', { status: 500 })
  return Response.json({ token: data.token })
}
