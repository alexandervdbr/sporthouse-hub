import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ClubLookup from '@/components/clients/ClubLookup'
import { isAdminUser } from '@/lib/auth-permissions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClubLookupPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const isAdmin = isAdminUser(user)

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <div className="flex-shrink-0 px-8 pt-8 pb-4 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">Club Lookup</h2>
        <p className="text-sm text-zinc-500">
          Zoek de juiste interne benaming voor elke club — klik om te kopiëren.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ClubLookup clientId={id} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
