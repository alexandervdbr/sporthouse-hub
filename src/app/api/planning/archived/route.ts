// Zelfde tabel als /api/planning/config, andere key — reuse planning_config
// (key: 'archived_employees') in plaats van een aparte tabel.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

export interface ArchivedEmployee {
  dept: string
  emp: string
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

// GET — iedereen die ingelogd is mag zien wie er gearchiveerd is (nodig om
// ze standaard uit de teamweergave te filteren); enkel PUT is beheer-only.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('planning_config')
      .select('value')
      .eq('key', 'archived_employees')
      .maybeSingle()

    if (error) return Response.json([])
    return Response.json(data?.value ?? [])
  } catch {
    return Response.json([])
  }
}

// PUT — admin only; upsert de volledige lijst
export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  let archived: ArchivedEmployee[]
  try {
    archived = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!Array.isArray(archived)) {
    return new Response('Body must be an array of {dept, emp}', { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('planning_config')
    .upsert(
      { key: 'archived_employees', value: archived, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return new Response(error.message, { status: 500 })

  return Response.json({ ok: true })
}
