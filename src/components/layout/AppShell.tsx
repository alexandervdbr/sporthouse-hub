'use client'

import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import PreviewBanner from '@/components/layout/PreviewBanner'
import PushNotificationSetup from '@/components/layout/PushNotificationSetup'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { Client } from '@/types/database'

interface Props {
  clients: Client[]
  children: React.ReactNode
  // Most pages scroll their own content; a few (chat, file manager, planners)
  // manage scrolling internally and want the frame to stay put.
  scroll?: 'auto' | 'hidden'
  pushNotifications?: boolean
}

// The single application frame, previously copy-pasted into eleven layout
// files. Keeping it in one place is what makes the sidebar collapse and the
// mobile drawer possible without touching every route.
//
// Height uses 100dvh rather than 100vh: on mobile browsers 100vh is the
// viewport *without* the address bar, so the bottom of the app ends up hidden
// behind it.
export default function AppShell({ clients, children, scroll = 'auto', pushNotifications = false }: Props) {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] overflow-hidden">
        {pushNotifications && <PushNotificationSetup />}
        <Sidebar clients={clients} />
        <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950 min-w-0">
          <PreviewBanner />
          <TopBar />
          <div className={`flex-1 ${scroll === 'hidden' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
