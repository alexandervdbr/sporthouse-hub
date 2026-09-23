import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FreelancersPage from '@/components/freelancers/FreelancersPage'
import { isAdminUser } from '@/lib/auth-permissions'

export const metadata = { title: 'Freelancers — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.app_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  const hasAccess = isAdmin || permsObj === null || sections.includes('freelancers')
  if (!hasAccess) redirect('/dashboard')

  return <FreelancersPage />
}
