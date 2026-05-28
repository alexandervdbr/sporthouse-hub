import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DocumentManager from '@/components/sporthouse/DocumentManager'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

interface Props {
  params: Promise<{ id: string }>
}

export default async function FinancePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()
  if (client.name !== 'Sporthouse') redirect(`/clients/${id}`)

  const sections: string[] = user?.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '') || sections.includes('beheer')
  const canSee = isAdmin || sections.includes('financien_bekijken') || sections.includes('financien_beheren')
  const canManage = isAdmin || sections.includes('financien_beheren')

  if (!canSee) redirect(`/clients/${id}`)

  return (
    <div className="h-full overflow-y-auto">
      <DocumentManager
        section="finance"
        canManage={canManage}
        currentUserEmail={user?.email ?? null}
      />
    </div>
  )
}
