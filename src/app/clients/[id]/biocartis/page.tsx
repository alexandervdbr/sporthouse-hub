import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BiocartisChat from '@/components/clients/BiocartisChat'

interface Props {
  params: Promise<{ id: string }>
}

export default async function BiocartisPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!client || client.name !== 'Sporthouse') notFound()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-8 pt-8 pb-5 border-b border-zinc-900">
        <h2 className="text-base font-semibold text-sh-grey mb-1">Biocartis Instructies</h2>
        <p className="text-sm text-zinc-500">
          Upload werkinstructies als PDF en stel vragen over de inhoud via AI.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <BiocartisChat clientId={id} />
      </div>
    </div>
  )
}
