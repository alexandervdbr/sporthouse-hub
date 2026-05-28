import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FreelancerPortal from '@/components/portal/FreelancerPortal'

export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id, name, email')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) redirect('/login')

  return <FreelancerPortal freelancerId={freelancer.id} freelancerName={freelancer.name} />
}
