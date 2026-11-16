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
  // hem op dezelfde manier kwijt. En de namiddag van een halve dag ook.
  //
  // Hoofdletterongevoelig: de dag-editor slaat de status in hoofdletters op
  // ("VERLOF"), terwijl de preset "Verlof" heet. Met een exacte vergelijking
  // stond hier voor zulke presets altijd 0.
  const patroon = (v: string) => `"${v.replace(/[\\%_"]/g, c => '\\' + c)}"`
  const filter = ['value', 'value_pm']
    .flatMap(kol => [name, `${name} - THUIS`].map(v => `${kol}.ilike.${patroon(v)}`))
    .join(',')
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('planning_entries')
    .select('contact_id', { count: 'exact', head: true })
    .or(filter)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ count: count ?? 0 })
}
