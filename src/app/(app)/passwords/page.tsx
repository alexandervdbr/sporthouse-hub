import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PasswordsPage from '@/components/passwords/PasswordsPage'
import { hasSection } from '@/lib/auth-permissions'

export const metadata = { title: 'Wachtwoorden — Sporthouse' }

// Real enforcement now lives server-side in the get_credentials()/
// upsert_credential()/delete_credential() RPC functions (see migration
// 0025) — canAdd/canDelete here are just UI affordances (which buttons to
// show), not the actual access boundary, so it's fine that they're
// computed the same permissive-looking way as before.
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!hasSection(user, 'wachtwoorden_bekijken')) redirect('/dashboard')

  const canAdd    = hasSection(user, 'wachtwoorden_toevoegen')
  const canDelete = hasSection(user, 'wachtwoorden_verwijderen')

  return <PasswordsPage canAdd={canAdd} canDelete={canDelete} />
}
