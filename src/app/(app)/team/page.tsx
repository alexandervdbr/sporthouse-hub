import { createClient } from '@/lib/supabase/server'
import TeamDirectory from '@/components/team/TeamDirectory'

export default async function TeamPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('category', 'intern')
    .order('name')

  const internClients = clients ?? []

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-sh-grey mb-1">Team</h2>
          <p className="text-sm text-zinc-500">
            Overzicht van alle teamleden met contactgegevens.
          </p>
        </div>
        <TeamDirectory internClients={internClients} />
      </div>
    </div>
  )
}
