import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { Client } from '@/types/database'
import { filterClientsForUser } from '@/lib/filter-clients'

// Single shared layout for every authenticated in-app section (dashboard,
// clients, chat, team, planning, equipment, freelancers, admin, events,
// projects, calendar, mijn-gedacht) — previously each had its own,
// near-identical layout.tsx, which meant AppShell (and the sidebar inside
// it) was a genuinely different React subtree per section. Navigating
// between sections forced a full unmount/remount of the sidebar itself,
// with the root loading.tsx's fallback wiping the whole screen in between
// — not just swapping the page content the way a shared persistent shell
// should. One layout means one AppShell instance that survives navigation
// between all of these, and the "fetch the user + every client" query only
// runs once per session instead of on every cross-section navigation.
export default async function AppLayout({
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
