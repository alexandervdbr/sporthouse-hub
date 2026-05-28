import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PasswordsPage from '@/components/passwords/PasswordsPage'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export const metadata = { title: 'Wachtwoorden — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.user_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const unrestricted = isAdmin || permsObj === null

  const hasAccess = unrestricted || sections.includes('wachtwoorden_bekijken')
  if (!hasAccess) redirect('/dashboard')

  const canAdd    = unrestricted || sections.includes('wachtwoorden_toevoegen')
  const canDelete = unrestricted || sections.includes('wachtwoorden_verwijderen')

  // null = all credentials visible, string[] = only specific ones
  const allowedIds: string[] | null = unrestricted ? null : (permsObj?.credentials ?? null)

  return <PasswordsPage canAdd={canAdd} canDelete={canDelete} allowedIds={allowedIds} />
}
