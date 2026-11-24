// Afwijkend Asana-adres per persoon (0098, src/lib/asana.ts). Gebruikt door de
// config-tab van de Content Planner en de Briefing Builder; alleen admins,
// net zoals de rest van die config.

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { fetchAsanaUsers, readAsanaOverrides } from '@/lib/asana'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

// POST { emails } → per hub-adres het Asana-adres dat gebruikt wordt en of
// die persoon in Asana gevonden wordt. Eén Asana-verzoek, bij het openen van
// de config-tab en na een wijziging — niet op een timer.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return new Response('Forbidden', { status: 403 })

  const { emails } = await req.json()
  if (!Array.isArray(emails)) return new Response('Bad request', { status: 400 })
  const list = (emails as unknown[]).filter((e): e is string => typeof e === 'string' && !!e)

  const [users, overrides] = await Promise.all([fetchAsanaUsers(), readAsanaOverrides(list)])

  const result: Record<string, { asana_email: string | null; found: boolean | null }> = {}
  for (const email of list) {
    const key = email.trim().toLowerCase()
    const override = overrides[key] ?? null
    result[email] = {
      asana_email: override,
      // null = Asana niet bereikbaar, dus onbekend (geen valse waarschuwing)
      found: users ? !!users[override ?? key] : null,
    }
  }
  return Response.json(result)
}

// PUT { email, asana_email } → zet of wist (leeg) het Asana-adres van alle
// teamcontacten met dat hub-adres.
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return new Response('Forbidden', { status: 403 })

  const { email, asana_email } = await req.json()
  if (typeof email !== 'string' || !email.trim()) return new Response('email required', { status: 400 })

  const value = typeof asana_email === 'string' && asana_email.trim() ? asana_email.trim().toLowerCase() : null
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return Response.json({ error: 'Geen geldig mailadres.' }, { status: 400 })
  }
  // Hetzelfde als het hub-adres is geen afwijking.
  const stored = value === email.trim().toLowerCase() ? null : value

  const admin = createAdminClient()
  const { data: intern } = await admin.from('clients').select('id').eq('category', 'intern')
  const ids = (intern ?? []).map((c: { id: string }) => c.id)

  const { data, error } = await admin
    .from('contacts')
    .update({ asana_email: stored })
    .in('client_id', ids)
    // ilike voor hoofdletters; _ en % escapen, anders zijn het jokers
    .ilike('email', email.trim().replace(/[\\%_]/g, c => '\\' + c))
    .select('id')

  if (error) return new Response(error.message, { status: 500 })
  if (!data || data.length === 0) {
    return Response.json({ error: 'Geen teamcontact met dit adres gevonden.' }, { status: 404 })
  }
  return Response.json({ ok: true, asana_email: stored })
}
