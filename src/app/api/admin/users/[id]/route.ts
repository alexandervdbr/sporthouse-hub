import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, loadRoles, buildAppMetadata, locksOutCaller } from '@/lib/access-roles-server'

// PATCH — gegevens (naam, e-mail, telefoon, functie) en rol, afwijkingen,
// klanten, planningkolom, wachtwoorden, vervaldatum.
// Elk veld is optioneel; wat ontbreekt blijft zoals het was.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { access_role, overrides, clients, planning_column, credentials, expires_at } = body
  const { full_name, email, phone, job_role } = body as {
    full_name?: string; email?: string; phone?: string | null; job_role?: string | null
  }

  const admin = createAdminClient()
  const roles = await loadRoles(admin)
  if (access_role && !roles.some(r => r.id === access_role)) {
    return new Response('Onbekende rol', { status: 400 })
  }

  const { data: { user: existing } } = await admin.auth.admin.getUserById(id)
  if (!existing) return new Response('Gebruiker niet gevonden', { status: 404 })
  const updated = buildAppMetadata(existing.app_metadata, { access_role, overrides, clients, planning_column, credentials }, roles)
  if (expires_at !== undefined) updated.expires_at = expires_at || null
  const finalRole = roles.find(r => r.id === updated.role)
  if (finalRole?.requires_end_date && !updated.expires_at) {
    return new Response(`Een ${finalRole.label.toLowerCase()} heeft een einddatum nodig`, { status: 400 })
  }
  if (locksOutCaller(caller, id, updated)) {
    return new Response('Zonder Beheer sluit je jezelf buiten — kies een rol met Beheer', { status: 400 })
  }

  const oldEmail = (existing.email ?? '').trim().toLowerCase()
  const newEmail = email?.trim().toLowerCase()
  if (email !== undefined && !newEmail) return new Response('E-mailadres is verplicht', { status: 400 })
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return new Response('Dat is geen geldig e-mailadres', { status: 400 })
  }
  const emailChanged = !!newEmail && newEmail !== oldEmail

  // Eén update voor het account: e-mail meteen bevestigd, net als bij het
  // uitnodigen, anders koppelt inloggen met Google niet.
  const { error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: updated,
    ...(emailChanged ? { email: newEmail, email_confirm: true } : {}),
    ...(full_name !== undefined ? { user_metadata: { ...existing.user_metadata, full_name: full_name.trim() } } : {}),
  })
  if (error) {
    const taken = /already|registered|exists/i.test(error.message)
    return new Response(taken ? 'Er bestaat al een account met dat e-mailadres' : error.message, { status: taken ? 409 : 500 })
  }

  // Het Team-contact en een eventuele freelancer hangen aan het account via
  // het e-mailadres. Op het oude adres zoeken en meeveranderen, anders raakt
  // de persoon zijn plek in Team (en de planning) of in het portaal kwijt.
  // In JS vergelijken en niet met ilike — zie de uitleg bij het uitnodigen.
  const profileTouched = emailChanged || full_name !== undefined || phone !== undefined || job_role !== undefined
  if (profileTouched && oldEmail) {
    const { data: internClients } = await admin.from('clients').select('id').eq('category', 'intern')
    const internIds = (internClients ?? []).map((c: { id: string }) => c.id)
    const { data: contacts } = internIds.length > 0
      ? await admin.from('contacts').select('id, email').in('client_id', internIds).not('email', 'is', null)
      : { data: [] }
    const contact = (contacts ?? []).find((c: { email: string | null }) => c.email?.trim().toLowerCase() === oldEmail)
    if (contact) {
      const patch: Record<string, string | null> = {}
      if (emailChanged) patch.email = newEmail!
      if (full_name?.trim()) patch.name = full_name.trim()
      if (phone !== undefined) patch.phone = phone?.trim() || null
      if (job_role !== undefined) patch.role = job_role?.trim() || null
      const { error: cErr } = await admin.from('contacts').update(patch).eq('id', contact.id)
      if (cErr) return new Response(`Account aangepast, maar Team niet: ${cErr.message}`, { status: 500 })
    }

    if (emailChanged) {
      const { data: freelancers } = await admin.from('freelancers').select('id, email').not('email', 'is', null)
      const fl = (freelancers ?? []).find((f: { email: string | null }) => f.email?.trim().toLowerCase() === oldEmail)
      if (fl) {
        const { error: fErr } = await admin.from('freelancers').update({ email: newEmail }).eq('id', fl.id)
        if (fErr) return new Response(`Account aangepast, maar freelancer niet: ${fErr.message}`, { status: 500 })
      }
    }
  }

  return new Response(null, { status: 204 })
}

// DELETE — remove user
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin()
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await params

  // Prevent self-deletion
  if (id === caller.id) return new Response('Je kan jezelf niet verwijderen', { status: 400 })

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  )
  if (!res.ok) return new Response(await res.text(), { status: res.status })
  return new Response(null, { status: 204 })
}
