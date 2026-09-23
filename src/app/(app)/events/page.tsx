import { createClient } from '@/lib/supabase/server'
import EventCalendar from '@/components/calendar/EventCalendar'
import { isAdminUser } from '@/lib/auth-permissions'

export const metadata = { title: 'Projectkalender — Sporthouse' }

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const isAdmin = isAdminUser(user)
  const permsObj = user?.app_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const canAdd    = isAdmin || permsObj === null || sections.includes('projectkalender_toevoegen')
  const canDelete = isAdmin || permsObj === null || sections.includes('projectkalender_verwijderen')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-white mb-1">Projectkalender</h2>
          <p className="text-sm text-zinc-500">Overzicht van alle events, shoots, wedstrijden en deadlines.</p>
        </div>
        <EventCalendar canAdd={canAdd} canDelete={canDelete} />
      </div>
    </div>
  )
}
