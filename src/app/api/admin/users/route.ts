import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const ok = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  return ok ? user : null
}

// GET — list all users
export async function GET() {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return new Response(error.message, { status: 500 })

  const result = users.map(u => ({
    id:          u.id,
    email:       u.email ?? '',
    full_name:   u.user_metadata?.full_name ?? u.user_metadata?.name ?? '',
    permissions: u.user_metadata?.permissions ?? null,
    expires_at:  u.user_metadata?.expires_at ?? null,
    last_sign_in: u.last_sign_in_at ?? null,
    created_at:  u.created_at,
    confirmed:   !!u.email_confirmed_at,
  }))

  return Response.json(result)
}

// POST — invite new user
export async function POST(req: Request) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { email, full_name, phone, role, permissions } = await req.json()
  if (!email?.trim()) return new Response('E-mailadres is verplicht', { status: 400 })

  const admin = createAdminClient()

  // Create pre-approved user (email pre-confirmed so Google OAuth linking works)
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    user_metadata: {
      full_name:   full_name?.trim() ?? '',
      allowed:     true,
      permissions: permissions ?? null,
    },
    email_confirm: true,
  })
  if (error) return new Response(error.message, { status: 500 })

  // Auto-link to Team: create a contact entry under the first intern client
  const { data: internClients } = await admin
    .from('clients')
    .select('id')
    .eq('category', 'intern')
    .limit(1)

  if (internClients && internClients.length > 0) {
    await admin.from('contacts').insert({
      client_id: internClients[0].id,
      name:      (full_name?.trim() || email.trim()),
      email:     email.trim(),
      phone:     phone?.trim() || null,
      role:      role?.trim() || null,
    })
  }

  return Response.json({ id: data.user.id, email: data.user.email })
}
