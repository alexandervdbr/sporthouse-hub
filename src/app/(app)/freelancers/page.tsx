import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageFreelancers, canViewFreelancers } from '@/features/freelancers/lib/access'
import Overview from '@/components/freelancers/overzicht/Overview'

export const metadata = { title: 'Freelancers — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bekijken of beheren. Een account zonder ingestelde permissies krijgt hier niets.
  if (!canViewFreelancers(user)) redirect('/dashboard')

  // Klantnamen voor "samenwerkingen" (typen of kiezen). Met de client van de
  // gebruiker, dus alleen klanten die hij mag zien; interne klanten niet.
  const { data: clients } = await supabase.from('clients').select('name').or('category.is.null,category.neq.intern').order('name')

  return (
    <Suspense>
      <Overview canManage={canManageFreelancers(user)} clients={(clients ?? []).map(c => c.name as string).filter(Boolean)} />
    </Suspense>
  )
}
