import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ok = isAdminUser(user)
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
    permissions: u.app_metadata?.permissions ?? null,
    expires_at:  u.app_metadata?.expires_at ?? null,
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
  // Role/access fields go in app_metadata — it's server-only, unlike user_metadata
  // which the client can rewrite via supabase.auth.updateUser().
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    user_metadata: {
      full_name: full_name?.trim() ?? '',
    },
    app_metadata: {
      allowed:     true,
      permissions: permissions ?? null,
    },
    email_confirm: true,
  })
  if (error) return new Response(error.message, { status: 500 })

  // Koppelen aan Team. Dit deed vroeger een blinde insert, en dat is hoe er
  // duplicaten ontstonden: iemand twee keer uitnodigen, of uitnodigen van
  // iemand die al handmatig in Team stond, leverde telkens een tweede
  // contactrij op. Die duplicaten lopen door tot in de planning, want het
  // rooster koppelt op naam.
  //
  // Nu eerst zoeken. Over álle interne klanten, niet alleen de eerste — dat
  // is ook waar /api/team/members kijkt, dus een bestaand contact onder een
  // tweede interne klant werd anders alsnog gemist.
  const { data: internClients } = await admin
    .from('clients')
    .select('id')
    .eq('category', 'intern')

  const internIds = (internClients ?? []).map((c: { id: string }) => c.id)
  if (internIds.length > 0) {
    const wanted = email.trim().toLowerCase()

    // In JS vergelijken en niet met ilike: een e-mailadres mag een underscore
    // bevatten, en dat is een jokerteken in ilike — dan matcht "a_b@x.be" ook
    // "axb@x.be". Het gaat om een handvol rijen, dus dit kost niets.
    const { data: existing } = await admin
      .from('contacts')
      .select('id, name, phone, role, email')
      .in('client_id', internIds)
      .not('email', 'is', null)

    const match = (existing ?? []).find(
      (c: { email: string | null }) => c.email?.trim().toLowerCase() === wanted
    )

    if (match) {
      // Aanvullen, niet overschrijven: wat al ingevuld staat is vaker juist
      // dan wat er toevallig in dit uitnodigingsformulier stond.
      const patch: Record<string, string> = {}
      if (full_name?.trim() && !match.name?.trim()) patch.name = full_name.trim()
      if (phone?.trim() && !match.phone?.trim()) patch.phone = phone.trim()
      if (role?.trim() && !match.role?.trim()) patch.role = role.trim()
      if (Object.keys(patch).length > 0) {
        await admin.from('contacts').update(patch).eq('id', match.id)
      }
    } else {
      await admin.from('contacts').insert({
        client_id: internIds[0],
        name:      (full_name?.trim() || email.trim()),
        email:     email.trim(),
        phone:     phone?.trim() || null,
        role:      role?.trim() || null,
      })
    }
  }

  return Response.json({ id: data.user.id, email: data.user.email })
}
