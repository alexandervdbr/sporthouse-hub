import { createAdminClient } from '@/lib/supabase/server'
import { requireGear } from '@/lib/gear/server'
import { activePeople } from '@/lib/gear/people'
import { todayInBrussels } from '@/lib/gear/dates'

// De collega's die je kan kiezen bij "voor wie": actieve accounts, zonder
// freelancers. Alleen naam en e-mail; rechten en rollen blijven bij Beheer.
// Accounts lijst je enkel met de service-sleutel op, en hier alleen lezend.
export async function GET() {
  const auth = await requireGear('view')
  if ('error' in auth) return auth.error

  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 })
  if (error) return new Response('Kon de collega\'s niet ophalen.', { status: 500 })
  return Response.json(activePeople(data.users, todayInBrussels()))
}
