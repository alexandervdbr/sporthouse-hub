import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PreassistPage from '@/components/preassist/PreassistPage'
import { isAdminUser } from '@/lib/auth-permissions'

export const metadata = { title: 'Pré-assist — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.app_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  const canManageEditions = isAdmin || permsObj === null || sections.includes('preassist_beheer')
  const canAdd            = isAdmin || permsObj === null || sections.includes('preassist_toevoegen')
  const canDeleteAll      = isAdmin || permsObj === null || sections.includes('preassist_verwijderen')

  return (
    <PreassistPage
      currentUserId={user.id}
      isAdmin={isAdmin}
      canManageEditions={canManageEditions}
      canAdd={canAdd}
      canDeleteAll={canDeleteAll}
    />
  )
}
