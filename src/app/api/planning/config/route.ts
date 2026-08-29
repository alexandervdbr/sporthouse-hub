// Run in Supabase SQL editor:
// CREATE TABLE IF NOT EXISTS planning_config (
//   key TEXT PRIMARY KEY,
//   value JSONB NOT NULL,
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Department } from '@/lib/planning-config'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ok = isAdminUser(user)
  return ok ? user : null
}

// GET — fetch departments config; returns null if not found
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('planning_config')
      .select('value')
      .eq('key', 'departments')
      .maybeSingle()

    if (error) return Response.json(null)
    return Response.json(data?.value ?? null)
  } catch {
    return Response.json(null)
  }
}

// PUT — admin only; upsert departments config
export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  let departments: Department[]
  try {
    departments = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!Array.isArray(departments)) {
    return new Response('Body must be an array of departments', { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('planning_config')
    .upsert(
      { key: 'departments', value: departments, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return new Response(error.message, { status: 500 })

  return Response.json({ ok: true })
}
