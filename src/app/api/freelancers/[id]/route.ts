import { requireFreelancers, parseBody, isUuid, writeError } from '@/features/freelancers/lib/server'
import { freelancerUpdateSchema } from '@/features/freelancers/lib/schemas'
import { LIST_COLUMNS } from '@/features/freelancers/lib/columns'
import { toListRow } from '@/features/freelancers/lib/rows'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => new Response('Niet gevonden', { status: 404 })

// PATCH  (beheren) — het formulier van het paneel, alleen de velden uit de whitelist
// DELETE (beheren) — hard verwijderen; de samenwerkingen gaan mee (0094,
//                    on delete cascade). De UI vraagt eerst een bevestiging
//                    met het aantal samenwerkingen. Archiveren is de standaard.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const body = await parseBody(req, freelancerUpdateSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase
    .from('freelancers').update(body.data).eq('id', id)
    .select(LIST_COLUMNS).maybeSingle()
  if (error) return writeError(error, 'Kon de freelancer niet opslaan.')
  if (!data) return notFound()
  return Response.json(toListRow(data as unknown as Record<string, unknown> & { freelancer_projects?: { score: number | null }[] }))
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const { data, error } = await auth.supabase.from('freelancers').delete().eq('id', id).select('id')
  if (error) {
    // Tot de opruimmigratie (Fase 4) kan een oude opdracht nog naar de
    // freelancer verwijzen; dat blokkeert het verwijderen.
    if (error.code === '23503') return new Response('Deze freelancer wordt nog ergens gebruikt en kan niet verwijderd worden. Archiveer hem in de plaats.', { status: 409 })
    return new Response('Kon de freelancer niet verwijderen.', { status: 500 })
  }
  if (!data?.length) return notFound()
  return new Response(null, { status: 204 })
}
