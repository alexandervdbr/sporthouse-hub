import { requireFreelancers, isUuid } from '@/features/freelancers/lib/server'
import { LIST_COLUMNS } from '@/features/freelancers/lib/columns'
import { toListRow } from '@/features/freelancers/lib/rows'

// POST   (beheren) — archiveren: verdwijnt uit de lijst en uit de keuzelijst
//                    van de materiaalplanner; bestaande boekingen blijven.
// DELETE (beheren) — terugzetten.
type Ctx = { params: Promise<{ id: string }> }

async function setArchived(id: string, archived: boolean) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { data, error } = await auth.supabase.from('freelancers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select(LIST_COLUMNS).maybeSingle()
  if (error) return new Response('Kon de freelancer niet bijwerken.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(toListRow(data as unknown as Record<string, unknown> & { freelancer_projects?: { score: number | null }[] }))
}

export async function POST(_req: Request, { params }: Ctx) {
  return setArchived((await params).id, true)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return setArchived((await params).id, false)
}
