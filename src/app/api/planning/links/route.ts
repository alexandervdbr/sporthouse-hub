// Beheer van persoonlijke planningslinks. Beheer-only; de link zelf wordt
// zonder login geopend, zie /api/planning/mine.

import { randomBytes } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import type { PlanningLinkRow } from '@/lib/planning-links'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

export async function GET() {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_links')
    .select('token, department, employee, created_by, created_at, revoked_at, last_seen_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json((data ?? []) as PlanningLinkRow[])
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  let body: { department?: unknown; employee?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const department = typeof body.department === 'string' ? body.department.trim() : ''
  const employee = typeof body.employee === 'string' ? body.employee.trim() : ''
  if (!department || !employee) {
    return new Response('Afdeling en naam zijn verplicht', { status: 400 })
  }

  // Op de server gemaakt en niet in de browser, anders dan bij share_links.
  // Daar is de code een wegwijzer en blijft de login de sleutel; hier ís het
  // token de sleutel, dus de kwaliteit van de willekeur doet ertoe.
  const token = randomBytes(24).toString('base64url')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planning_links')
    .insert({ token, department, employee, created_by: user.email ?? null })
    .select('token, department, employee, created_by, created_at, revoked_at, last_seen_at')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data as PlanningLinkRow, { status: 201 })
}

// Intrekken, niet verwijderen: zo blijft achteraf zichtbaar dat er een link
// was en wie hem gemaakt heeft.
export async function DELETE(req: Request) {
  if (!await requireAdmin()) return new Response('Forbidden', { status: 403 })

  const token = new URL(req.url).searchParams.get('token')
  if (!token) return new Response('Token ontbreekt', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('planning_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token)

  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
