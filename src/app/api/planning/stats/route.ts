import { createClient } from '@/lib/supabase/server'
import { hasSection } from '@/lib/auth-permissions'
import { fetchAllRows } from '@/lib/planning-paginate'

// GET — per-contact, per-status, per-month day counts for one year: de
// optelling achter het tabblad Statistieken.
// Gated on the planning_statistieken permission (or beheer) at the route
// level too, mirroring the rest of this app's convention, even though
// planning_entries itself is already readable by any authenticated user
// (see the RLS note in 0024_client_scoped_rls_policies.sql) — this is about
// which UI users see the tab, same intent as the permission itself.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!hasSection(user, 'planning_statistieken')) return new Response('Forbidden', { status: 403 })

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  if (!year) return new Response('Missing year', { status: 400 })

  // Gepagineerd, niet in één vraag: een jaar zit ver boven de duizend rijen
  // die Supabase standaard teruggeeft, en een drukke maand ook. Zonder dit
  // telde deze tabel een willekeurig deel van de planning en zag dat er net
  // zo geloofwaardig uit. Zie src/lib/planning-paginate.ts.
  // Per contact. Dat is de persoon, los van hoe hij heet en in welke afdeling
  // hij nu staat — wisselt hij van afdeling, dan verhuist zijn telling mee in
  // plaats van te splitsen.
  // Altijd het hele jaar, en altijd met de maand erbij: de tabel zet twaalf
  // maanden naast elkaar. Er was hier ook een ?month= om één maand op te
  // halen; die is weg sinds die weergave weg is. Een parameter die niemand
  // meegeeft is een parameter die stilletjes stopt met werken.
  let data: { contact_id: string; month: number; value: string }[]
  try {
    data = await fetchAllRows<{ contact_id: string; month: number; value: string }>(() => {
      return supabase
        .from('planning_entries')
        .select('contact_id, month, value')
        .eq('year', year)
        .order('id', { ascending: true })
    })
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Ophalen mislukt', { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const row of data) {
    const key = `${row.contact_id}\u0000${row.month}\u0000${row.value}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const tellingen = [...counts.entries()].map(([key, count]) => {
    const [contactId, m, value] = key.split('\u0000')
    return { contactId, month: Number(m), value, count }
  })

  // Welke jaren er überhaupt planning hebben. Zonder dit stond er in de
  // jaarkiezer een vast venster van vorig/dit/volgend jaar, en wie iets in
  // 2028 inplande kon dat hier niet terugvinden — het jaar bestond niet in de
  // lijst, zonder dat iets dat zei.
  //
  // Twee keer één rij, op de index die onder de unieke sleutel ligt
  // (year, month, day, contact_id). Dat is goedkoper dan alle jaren ophalen
  // en ontdubbelen, en het antwoord is hetzelfde.
  const [eerste, laatste] = await Promise.all([
    supabase.from('planning_entries').select('year').order('year', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('planning_entries').select('year').order('year', { ascending: false }).limit(1).maybeSingle(),
  ])

  return Response.json({
    tellingen,
    minYear: eerste.data?.year ?? null,
    maxYear: laatste.data?.year ?? null,
  })
}
