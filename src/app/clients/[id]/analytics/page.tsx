import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

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
  if (client.name !== 'Sporthouse' || !ADMIN_EMAILS.includes(user?.email ?? '')) {
    redirect(`/clients/${id}`)
  }

  return <AnalyticsDashboard />
}
