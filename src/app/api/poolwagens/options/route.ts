import { createAdminClient } from '@/lib/supabase/server'
import { requirePoolwagens } from '@/lib/poolwagens/server'
import { activePeople } from '@/lib/gear/people'
import { todayInBrussels } from '@/lib/gear/dates'
import type { PoolOptions } from '@/lib/poolwagens/types'

// Keuzelijsten: projecten (zoals de materiaalplanner: alles behalve
// voltooid, met de client van de gebruiker) en collega's voor de filter in de
// historiek (accounts lijst je alleen met de service-sleutel op; hier alleen
// lezend, naam en id).
export async function GET() {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [projects, accounts] = await Promise.all([
    supabase.from('projects').select('id, name, client_id').neq('status', 'voltooid').order('name'),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])

  const options: PoolOptions = {
    projects: projects.data ?? [],
    colleagues: accounts.error ? [] : activePeople(accounts.data.users, todayInBrussels()).map(p => ({ id: p.id, name: p.name })),
  }
  return Response.json(options)
}
