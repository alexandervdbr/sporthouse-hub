import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExternalRentals from '@/components/equipment/ExternalRentals'
import { isAdminUser } from '@/lib/auth-permissions'

export default async function ExternalRentalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.app_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  const hasAccess = isAdmin || permsObj === null || sections.includes('materiaal_extern')
  if (!hasAccess) redirect('/equipment')

  return <ExternalRentals />
}
