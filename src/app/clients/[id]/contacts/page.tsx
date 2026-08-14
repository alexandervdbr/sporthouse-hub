import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContactsManager from '@/components/clients/ContactsManager'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ContactsPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, category')
    .eq('id', id)
    .single()

  if (!client || client.category !== 'intern') notFound()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Contacten</h2>
          <p className="text-sm text-zinc-500">
            Teamleden en contactgegevens voor {client.name}.
          </p>
        </div>
        <ContactsManager clientId={id} />
      </div>
    </div>
  )
}
