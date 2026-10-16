import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PreassistPage from '@/components/preassist/PreassistPage'
import { isAdminUser, hasOpenSection } from '@/lib/auth-permissions'

export const metadata = { title: 'Pré-assist — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Stond er niet: de sidebar verbergt het item wel, maar wie /preassist
  // intikte kwam binnen. Zelfde poortwachter als /passwords, en hij moet hier
  // staan omdat de middleware alleen op inloggen en freelancer-accounts let,
  // niet op secties.
  if (!hasOpenSection(user, 'preassist')) redirect('/dashboard')

  return (
    <PreassistPage
      currentUserId={user.id}
      isAdmin={isAdminUser(user)}
      canManageEditions={hasOpenSection(user, 'preassist_beheer')}
      canAdd={hasOpenSection(user, 'preassist_toevoegen')}
      canDeleteAll={hasOpenSection(user, 'preassist_verwijderen')}
    />
  )
}
