import { createClient } from '@/lib/supabase/server'
import { isActiveContact } from '@/lib/employment'
import { readTeamContacts } from '@/lib/team-contacts-server'

type Member = {
  id: string; name: string; role: string | null; email: string | null; phone: string | null
  photo_url: string | null; employment_type: string | null; active_until: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Niet langer afhankelijk van klanttoegang: wie Team of Planning mag zien,
  // ziet de collega's — zie src/lib/team-contacts-server.ts.
  const { data, error } = await readTeamContacts<Member>(
    supabase, user, 'id, name, role, email, phone, photo_url, employment_type, active_until',
  )
  if (error) return new Response(error, { status: 500 })

  // `active` erbij, afgeleid in plaats van opgeslagen: één plek die bepaalt
  // wat "draait nu mee" betekent, zodat de Team-pagina en de planning het
  // niet elk op hun eigen manier kunnen uitrekenen.
  const result = data.map(c => ({ ...c, active: isActiveContact(c) }))
  return Response.json(result)
}
