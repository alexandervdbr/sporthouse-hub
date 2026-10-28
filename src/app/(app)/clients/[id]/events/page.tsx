import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PROJECTKALENDER_ENABLED } from '@/lib/features'
import EventCalendar from '@/components/calendar/EventCalendar'
import { isAdminUser } from '@/lib/auth-permissions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientEventsPage({ params }: Props) {
  const { id } = await params
  if (!PROJECTKALENDER_ENABLED) redirect(`/clients/${id}`)
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

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
          <p className="text-sm text-zinc-500">
            Events, shoots, wedstrijden en deadlines voor {client.name}.
          </p>
        </div>
        <EventCalendar clientId={id} canAdd={canAdd} canDelete={canDelete} />
      </div>
    </div>
  )
}
