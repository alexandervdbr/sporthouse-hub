import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canManageFreelancers, canViewFreelancers } from '@/features/freelancers/lib/access'
import FreelancersShell from '@/features/freelancers/internal/FreelancersShell'

export const metadata = { title: 'Freelancers — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bekijken of beheren. Een account zonder ingestelde permissies krijgt hier niets.
  if (!canViewFreelancers(user)) redirect('/dashboard')

  return (
    <Suspense>
      <FreelancersShell canManage={canManageFreelancers(user)} />
    </Suspense>
  )
}
