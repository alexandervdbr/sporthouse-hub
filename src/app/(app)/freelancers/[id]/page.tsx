import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageFreelancers, canViewFreelancers } from '@/features/freelancers/lib/access'
import ProfilePage from '@/features/freelancers/internal/profile/ProfilePage'

export const metadata = { title: 'Freelancer — Sporthouse' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!canViewFreelancers(user)) redirect('/dashboard')
  const { id } = await params
  return <Suspense><ProfilePage id={id} canManage={canManageFreelancers(user)} /></Suspense>
}
