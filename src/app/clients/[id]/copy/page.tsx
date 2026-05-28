import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CopyGenerator from '@/components/copy/CopyGenerator'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

interface Props {
  params: Promise<{ id: string }>
}

export default async function CopyPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: { user } }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.auth.getUser(),
  ])

  if (!client) notFound()

  const sections: string[] = user?.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '') || sections.includes('beheer')
  const canManageExamples = isAdmin || sections.includes('stijlvoorbeelden')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Copy Generator</h2>
          <p className="text-sm text-zinc-500">
            Genereer social media copy voor {client.name} op basis van jouw brief.
          </p>
        </div>

        <CopyGenerator clientId={id} clientName={client.name} canManageExamples={canManageExamples} />
      </div>
    </div>
  )
}
