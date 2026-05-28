import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Meeting } from '@/types/database'
import MeetingList from '@/components/clients/MeetingList'
import { Plus } from 'lucide-react'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientMeetingsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const isAdmin  = ADMIN_EMAILS.includes(user?.email ?? '')
  const permsObj = user?.user_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const canAccess = isAdmin || permsObj === null || sections.includes('vergaderingen')
  if (!canAccess) redirect(`/clients/${id}`)

  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-base font-semibold text-sh-grey mb-1">Vergaderingen</h2>
            <p className="text-sm text-zinc-500">
              Opgenomen en samengevatte vergaderingen voor {client.name}.
            </p>
          </div>
          <Link
            href={`/clients/${id}/meetings/new`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex-shrink-0"
            style={{ backgroundColor: '#3A913F' }}
          >
            <Plus size={14} />
            Nieuwe opname
          </Link>
        </div>

        <MeetingList
          meetings={(meetings as Meeting[]) || []}
          currentUserEmail={user?.email ?? null}
        />
      </div>
    </div>
  )
}
