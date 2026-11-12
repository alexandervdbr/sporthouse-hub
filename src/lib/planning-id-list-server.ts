// GET en PUT voor een lijst contact-id's in planning_config. Gedeeld door
// /api/planning/archived en /api/planning/excluded, die op de sleutel na
// identiek zijn.
//
// Lezen: wie de planning mag zien (de lijsten bepalen wat de teamweergave
// toont). Schrijven: alleen beheerders.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { canReadPlanning } from '@/lib/planning-access'
import { cleanIdList, parseIdList } from '@/lib/planning-id-list'

export function idListRoute(key: string) {
  async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })
    if (!canReadPlanning(user)) return new Response('Forbidden', { status: 403 })

    // Een leesfout is een fout, geen lege lijst: de client wacht op deze
    // lijst voor hij nieuwe Team-contacten in het rooster zet, en een lege
    // lijst zou iedereen die eruit gehaald is terugzetten.
    const { data, error } = await createAdminClient()
      .from('planning_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(cleanIdList(data?.value))
  }

  async function PUT(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const ids = parseIdList(body)
    if (!ids) return new Response('Verwacht een lijst van contact-id\'s', { status: 400 })

    const { error } = await createAdminClient()
      .from('planning_config')
      .upsert(
        { key, value: ids, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )

    if (error) return new Response(error.message, { status: 500 })
    return Response.json({ ok: true })
  }

  return { GET, PUT }
}
