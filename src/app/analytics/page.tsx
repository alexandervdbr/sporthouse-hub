import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/dashboard')
  }

  return <AnalyticsDashboard />
}
