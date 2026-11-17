import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { projectUpdateSchema } from '@/features/freelancers/lib/schemas'
import { PROJECT_COLUMNS } from '@/features/freelancers/lib/columns'

// Eén samenwerking, altijd gezocht onder de freelancer uit de URL.
// PATCH  (beheren) — bewerken
// DELETE (beheren) — verwijderen
type Ctx = { params: Promise<{ id: string; projectId: string }> }
const notFound = () => new Response('Niet gevonden', { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id, projectId } = await params
  if (!isUuid(id) || !isUuid(projectId)) return notFound()

  const body = await parseBody(req, projectUpdateSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase
    .from('freelancer_projects')
    .update(body.data)
    .eq('id', projectId)
    .eq('freelancer_id', id)
    .select(PROJECT_COLUMNS)
    .maybeSingle()
  if (error) return new Response('Kon de samenwerking niet opslaan.', { status: 500 })
  if (!data) return notFound()
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id, projectId } = await params
  if (!isUuid(id) || !isUuid(projectId)) return notFound()

  const { data, error } = await auth.supabase
    .from('freelancer_projects')
    .delete()
    .eq('id', projectId)
    .eq('freelancer_id', id)
    .select('id')
  if (error) return new Response('Kon de samenwerking niet verwijderen.', { status: 500 })
  if (!data?.length) return notFound()
  return new Response(null, { status: 204 })
}
