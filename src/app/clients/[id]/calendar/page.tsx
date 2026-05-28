import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContentCalendar from '@/components/calendar/ContentCalendar'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

interface Props {
  params: Promise<{ id: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '')
  const permsObj = user?.user_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const canAdd    = isAdmin || permsObj === null || sections.includes('contentkalender_toevoegen')
  const canDelete = isAdmin || permsObj === null || sections.includes('contentkalender_verwijderen')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-white mb-1">Content Kalender</h2>
          <p className="text-sm text-zinc-500">
            Plan en beheer social media posts voor {client.name}.
          </p>
        </div>

        <ContentCalendar clientId={id} canAdd={canAdd} canDelete={canDelete} />
      </div>
    </div>
  )
}
