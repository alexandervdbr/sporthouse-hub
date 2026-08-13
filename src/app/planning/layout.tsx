import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { Client } from '@/types/database'
import { filterClientsForUser } from '@/lib/filter-clients'

export default async function PlanningLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  const visibleClients = filterClientsForUser((clients as Client[]) || [], user)

  return (
    <AppShell clients={visibleClients}>
      {children}
    </AppShell>
  )
}
