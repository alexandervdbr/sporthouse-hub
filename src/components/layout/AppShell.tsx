'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import PreviewBanner from '@/components/layout/PreviewBanner'
import PushNotificationSetup from '@/components/layout/PushNotificationSetup'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { FavoritesProvider } from '@/contexts/FavoritesContext'
import { Client } from '@/types/database'

interface Props {
  clients: Client[]
  children: React.ReactNode
}

// Most sections scroll their own content; a few (chat, the client file
// manager/tools, equipment/freelancer planners) manage scrolling internally
// and want the frame to stay put instead.
const HIDDEN_SCROLL_PREFIXES = ['/clients', '/chat', '/equipment', '/freelancers']
// Only worth registering for push where a notification would actually lead
// somewhere relevant — matches each section's own pre-existing choice, now
// centralized here instead of being passed in by whichever layout rendered
// this section.
const PUSH_NOTIFICATION_PREFIXES = ['/dashboard', '/calendar', '/chat', '/events']

// The single application frame — one instance shared by every authenticated
// section via (app)/layout.tsx, rather than a separate mount per section.
// scroll/pushNotifications used to be passed in by whichever of the (former)
// eleven near-identical layout files rendered this; now that there's only
// one caller, they're derived from the current path instead, since that's
// the thing that actually varies.
//
// Height uses 100dvh rather than 100vh: on mobile browsers 100vh is the
// viewport *without* the address bar, so the bottom of the app ends up hidden
// behind it.
export default function AppShell({ clients, children }: Props) {
  const pathname = usePathname()
  const scroll: 'auto' | 'hidden' = HIDDEN_SCROLL_PREFIXES.some(p => pathname.startsWith(p)) ? 'hidden' : 'auto'
  const pushNotifications = PUSH_NOTIFICATION_PREFIXES.some(p => pathname.startsWith(p))

  return (
    <SidebarProvider>
      {/* Wraps children too, so the star on the client header shares state with
          the sidebar's favourites group. */}
      <FavoritesProvider>
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
      </FavoritesProvider>
    </SidebarProvider>
  )
}
