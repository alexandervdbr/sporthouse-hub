import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { FREELANCER_COLUMNS } from '@/features/freelancers/lib/columns'

// POST   (beheren) — archiveren. De persoonlijke link wordt meteen
//                    ingetrokken (trigger in 0093, ongeacht de route).
// DELETE (beheren) — terugzetten. De link blijft ingetrokken; maak een nieuwe.
type Ctx = { params: Promise<{ id: string }> }

async function setArchived(id: string, archived: boolean) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { data, error } = await auth.supabase.from('freelancers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select(FREELANCER_COLUMNS).maybeSingle()
  if (error) return new Response('Kon de freelancer niet bijwerken.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}

export async function POST(_req: Request, { params }: Ctx) {
  return setArchived((await params).id, true)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return setArchived((await params).id, false)
}
