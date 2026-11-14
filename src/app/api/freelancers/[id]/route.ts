import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { freelancerUpdateSchema } from '@/features/freelancers/lib/schemas'
import { FREELANCER_COLUMNS, STATS_COLUMNS } from '@/features/freelancers/lib/columns'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => new Response('Niet gevonden', { status: 404 })

// GET    (bekijken) — profiel + cijfers
// PATCH  (beheren)  — één kaart van het profiel; overall_rating, archiveren
//                     en avatar hebben elk een eigen route
// DELETE (beheren)  — alleen een freelancer zonder opdrachten (een typfout);
//                     anders archiveren
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const [{ data: freelancer }, { data: stats }] = await Promise.all([
    auth.supabase.from('freelancers').select(FREELANCER_COLUMNS).eq('id', id).maybeSingle(),
    auth.supabase.from('freelancer_stats').select(STATS_COLUMNS).eq('freelancer_id', id).maybeSingle(),
  ])
  if (!freelancer) return notFound()
  return Response.json({ ...(freelancer as unknown as Record<string, unknown>), stats: stats ?? null })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const body = await parseBody(req, freelancerUpdateSchema)
  if ('error' in body) return body.error

  const patch: Record<string, unknown> = { ...body.data }
  if ('availability' in patch || 'available_from' in patch) {
    patch.availability_updated_at = new Date().toISOString()
    patch.availability_updated_by = 'team'
  }

  const { data, error } = await auth.supabase
    .from('freelancers').update(patch).eq('id', id)
    .select(FREELANCER_COLUMNS).maybeSingle()
  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een freelancer met dit e-mailadres.', { status: 409 })
    if (error.code === '23503') return new Response('Een van de disciplines bestaat niet.', { status: 400 })
    if (error.code === '23514') return new Response('Geef een bedrag én een eenheid, of geen van beide.', { status: 400 })
    return new Response('Kon het profiel niet opslaan.', { status: 500 })
  }
  if (!data) return notFound()
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const { count } = await auth.supabase.from('freelancer_assignments')
    .select('id', { count: 'exact', head: true }).eq('freelancer_id', id)
  if ((count ?? 0) > 0) {
    return new Response('Deze freelancer heeft opdrachten en kan niet verwijderd worden. Archiveer hem in de plaats.', { status: 409 })
  }

  const { data, error } = await auth.supabase.from('freelancers').delete().eq('id', id).select('id')
  if (error) {
    if (error.code === '23503') return new Response('Deze freelancer wordt nog ergens gebruikt (bv. in de materiaalplanning). Archiveer hem in de plaats.', { status: 409 })
    return new Response('Kon de freelancer niet verwijderen.', { status: 500 })
  }
  if (!data?.length) return notFound()
  return new Response(null, { status: 204 })
}
