import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import PreviewBanner from '@/components/layout/PreviewBanner'
import PushNotificationSetup from '@/components/layout/PushNotificationSetup'
import { Client } from '@/types/database'
import { filterClientsForUser } from '@/lib/filter-clients'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase.from('clients').select('*').order('name')
  const visibleClients = filterClientsForUser((clients as Client[]) || [], user)

  return (
    <div className="flex h-screen overflow-hidden">
      <PushNotificationSetup />
      <Sidebar clients={visibleClients} />
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        <PreviewBanner />
        <TopBar />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
