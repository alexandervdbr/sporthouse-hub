import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ExpertChat from '@/components/expert/ExpertChat'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ExpertPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, logo_url')
    .eq('id', id)
    .single()

  if (!client) notFound()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 sm:px-8 pt-4 sm:pt-8 pb-6 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">{client.name} Expert AI</h2>
        <p className="text-sm text-zinc-500">
          Jouw persoonlijke AI-expert die alles weet over {client.name}.
        </p>
      </div>
      <div className="flex-1 min-h-0 px-4 sm:px-8 py-4 sm:py-6 w-full flex flex-col">
        <ExpertChat
          clientId={id}
          clientName={client.name}
          clientLogoUrl={client.logo_url}
        />
      </div>
    </div>
  )
}
