import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import FileManager from '@/components/clients/FileManager'
import { isAdminUser } from '@/lib/auth-permissions'

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

  const sections: string[] = user?.app_metadata?.permissions?.sections ?? []
  const isAdmin = isAdminUser(user)
  const canSee = isAdmin || sections.includes('financien_bekijken') || sections.includes('financien_beheren')
  const canManage = isAdmin || sections.includes('financien_beheren')

  if (!canSee) redirect(`/clients/${id}`)

  return (
    <div className="h-full overflow-y-auto">
      <FileManager
        backend={{
          filesApi: '/api/sporthouse/documents',
          foldersApi: '/api/sporthouse/folders',
          scopeKey: 'section',
          scopeValue: 'finance',
          rootLabel: 'Financiën',
        }}
        currentUserEmail={user?.email ?? null}
        isAdmin={isAdmin}
        canDeleteFiles={canManage}
        canManage={canManage}
      />
    </div>
  )
}
