import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BriefingBuilder from '@/components/clients/BriefingBuilder'
import { isAdminUser } from '@/lib/auth-permissions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function BriefingBuilderPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const isAdmin = isAdminUser(user)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-8 pt-8 pb-5 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">Briefing Builder</h2>
        <p className="text-sm text-zinc-500">
          Stel taken op met een volledige briefing en push ze naar Asana of kopieer ze per mail.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <BriefingBuilder clientId={id} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
