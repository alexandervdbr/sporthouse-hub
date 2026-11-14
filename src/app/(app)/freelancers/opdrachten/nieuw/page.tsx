import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageFreelancers } from '@/features/freelancers/lib/access'
import NewAssignmentForm from '@/features/freelancers/internal/assignments/NewAssignmentForm'

export const metadata = { title: 'Nieuwe opdracht — Sporthouse' }

// Alleen bij "beheren"; wie alleen mag bekijken gaat terug naar de lijst.
export default async function Page({ searchParams }: { searchParams: Promise<{ freelancer?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!canManageFreelancers(user)) redirect('/freelancers')
  const { freelancer } = await searchParams
  return <NewAssignmentForm initialFreelancer={typeof freelancer === 'string' && /^[0-9a-f-]{36}$/i.test(freelancer) ? freelancer : null} />
}
