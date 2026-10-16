import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

// GET ?name=PS — op hoeveel dagen staat deze status?
//
// Alleen om de bevestiging bij het verwijderen iets te laten zeggen. "Deze
// preset staat op 142 dagen" is een ander gesprek dan "preset verwijderen?",
// en het is het enige moment waarop die vraag gesteld wordt — dus geen telling
// die bij elke keer openen van de beheer-tab meeloopt.
//
// head: true telt serverside en stuurt geen rijen terug. De query raakt dus
// wel de tabel maar niet de lijn.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const name = new URL(req.url).searchParams.get('name')?.trim()
  if (!name) return new Response('Naam ontbreekt', { status: 400 })

  // De THUIS-variant hoort erbij: die cellen dragen dezelfde status en raken
  // hem op dezelfde manier kwijt.
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('planning_entries')
    .select('contact_id', { count: 'exact', head: true })
    .in('value', [name, `${name} - THUIS`])

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ count: count ?? 0 })
}
