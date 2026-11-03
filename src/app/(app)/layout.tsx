import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { Client } from '@/types/database'
import { filterClientsForUser } from '@/lib/filter-clients'
import { isAdminUser } from '@/lib/auth-permissions'
import { toStatusMap } from '@/lib/tool-status'

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

  // Toolstatus (dev-modus, zie src/lib/tool-status.ts) gaat mee in dezelfde
  // ronde: dit layout draait één keer per sessie, dus dat is één klein
  // verzoek extra per sessie, niet per pagina. Bestaat de tabel nog niet
  // (migratie 0069 niet uitgevoerd), dan geeft dit een fout en staat alles
  // gewoon live.
  const [{ data: clients }, { data: toolRows }] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('tool_status').select('tool, in_development, message, updated_at, updated_by'),
  ])

  const visibleClients = filterClientsForUser((clients as Client[]) || [], user)

  return (
    <AppShell clients={visibleClients} toolStatus={toStatusMap(toolRows)} isAdmin={isAdminUser(user)}>
      {children}
    </AppShell>
  )
}
