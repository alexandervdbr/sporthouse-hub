import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContentPlanner from '@/components/clients/ContentPlanner'
import { isAdminUser } from '@/lib/auth-permissions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ContentPlannerPage({ params }: Props) {
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
      <div className="flex-shrink-0 px-4 sm:px-8 pt-5 sm:pt-8 pb-4 sm:pb-5 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">Content Planner</h2>
        <p className="text-sm text-zinc-500">
          Plan posts tijdens de meeting en push ze in één klik naar Asana.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContentPlanner clientId={id} clientName={client.name} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
