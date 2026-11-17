import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { projectCreateSchema } from '@/features/freelancers/lib/schemas'
import { PROJECT_COLUMNS } from '@/features/freelancers/lib/columns'

// Samenwerkingen van één freelancer.
// GET  (bekijken) — nieuwste eerst
// POST (beheren)  — toevoegen. Het gemiddelde wordt nergens weggeschreven:
//      de lijst rekent het uit en het overschrijft de beoordeling nooit.
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { data, error } = await auth.supabase
    .from('freelancer_projects')
    .select(PROJECT_COLUMNS)
    .eq('freelancer_id', id)
    .order('date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) return new Response('Kon de samenwerkingen niet ophalen.', { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, projectCreateSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase
    .from('freelancer_projects')
    .insert({ ...body.data, freelancer_id: id })
    .select(PROJECT_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23503') return new Response('Niet gevonden', { status: 404 })
    return new Response('Kon de samenwerking niet opslaan.', { status: 500 })
  }
  return Response.json(data, { status: 201 })
}
