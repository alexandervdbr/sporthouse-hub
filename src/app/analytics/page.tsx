import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'
import { isAdminUser } from '@/lib/auth-permissions'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdminUser(user)) {
    redirect('/dashboard')
  }

  return <AnalyticsDashboard />
}
