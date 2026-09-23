import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'
import { isAdminUser } from '@/lib/auth-permissions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientAnalyticsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()
  if (client.name !== 'Sporthouse' || !isAdminUser(user)) {
    redirect(`/clients/${id}`)
  }

  return <AnalyticsDashboard />
}
