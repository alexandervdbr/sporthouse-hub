import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FreelancersPage from '@/components/freelancers/FreelancersPage'
import { canViewFreelancers } from '@/features/freelancers/lib/access'

export const metadata = { title: 'Freelancers — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bekijken of beheren. Een account zonder ingestelde permissies krijgt hier
  // niets — vroeger wel (permissions === null liet iedereen door).
  if (!canViewFreelancers(user)) redirect('/dashboard')

  return <FreelancersPage />
}
