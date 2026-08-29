import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SnippetsTool from '@/components/clients/SnippetsTool'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SnippetsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, category')
    .eq('id', id)
    .single()

  if (!client || client.category !== 'podcast') notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Mogelijke Snippets</h2>
          <p className="text-sm text-zinc-500">
            Plak het transcript van een aflevering en AI selecteert de sterkste fragmenten voor Instagram Reels, TikTok en YouTube Shorts.
          </p>
        </div>
        <SnippetsTool clientId={id} podcastName={client.name} />
      </div>
    </div>
  )
}
