import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageFreelancers, canViewFreelancers } from '@/features/freelancers/lib/access'
import AssignmentPage from '@/features/freelancers/internal/assignments/AssignmentPage'

export const metadata = { title: 'Opdracht — Sporthouse' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!canViewFreelancers(user)) redirect('/dashboard')
  const { id } = await params
  return <AssignmentPage id={id} canManage={canManageFreelancers(user)} />
}
