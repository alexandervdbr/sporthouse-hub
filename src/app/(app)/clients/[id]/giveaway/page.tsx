import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import GiveawayTool from '@/components/clients/GiveawayTool'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GiveawayPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!client) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Giveaway Tool</h2>
          <p className="text-sm text-zinc-500">
            Upload het CSV-bestand van de scraper, geef het correcte antwoord op en kies een willekeurige winnaar.
          </p>
        </div>
        <GiveawayTool clientId={id} />
      </div>
    </div>
  )
}
