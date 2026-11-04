import { createAdminClient } from '@/lib/supabase/server'
import { requirePoolwagens } from '@/lib/poolwagens/server'
import { activePeople } from '@/lib/gear/people'
import { todayInBrussels } from '@/lib/gear/dates'
import type { PoolOptions } from '@/lib/poolwagens/types'

// Keuzelijsten: de klanten van de hub (met de client van de gebruiker, dus
// zoals RLS ze voor die persoon toont, zoals in de materiaalplanner) en
// collega's voor de filter in de historiek (accounts lijst je alleen met de
// service-sleutel op; hier alleen lezend, naam en id).
export async function GET() {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [clients, accounts] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])

  const options: PoolOptions = {
    clients: clients.data ?? [],
    colleagues: accounts.error ? [] : activePeople(accounts.data.users, todayInBrussels()).map(p => ({ id: p.id, name: p.name })),
  }
  return Response.json(options)
}
