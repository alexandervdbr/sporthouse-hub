import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import PreviewBanner from '@/components/layout/PreviewBanner'
import { Client } from '@/types/database'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  if (!isAdmin) redirect('/dashboard')

  const { data: clients } = await supabase.from('clients').select('*').order('name')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar clients={(clients as Client[]) || []} />
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        <PreviewBanner />
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
