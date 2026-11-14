import { createAdminClient } from '@/lib/supabase/server'
import { requireGear } from '@/lib/gear/server'
import { activePeople } from '@/lib/gear/people'
import { todayInBrussels } from '@/lib/gear/dates'
import type { GearBookingOptions } from '@/lib/gear/types'

// Alles waaruit je kiest bij "voor wie" en "voor welk project", in één
// verzoek:
// - collega's: actieve accounts zonder freelancers. Accounts lijst je enkel
//   met de service-sleutel op, en hier alleen lezend (naam en e-mail).
// - freelancers, klanten en projecten met de client van de gebruiker, dus
//   zoals RLS ze voor die persoon toont.
export async function GET() {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const [accounts, freelancers, clients, projects] = await Promise.all([
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
    supabase.rpc('freelancer_picker'),
    supabase.from('clients').select('id, name, color').order('name'),
    supabase.from('projects').select('id, name, client_id').neq('status', 'voltooid').order('name'),
  ])
  if (accounts.error) return new Response('Kon de collega\'s niet ophalen.', { status: 500 })

  const options: GearBookingOptions = {
    colleagues: activePeople(accounts.data.users, todayInBrussels()),
    freelancers: freelancers.data ?? [],
    clients: clients.data ?? [],
    projects: projects.data ?? [],
  }
  return Response.json(options)
}
