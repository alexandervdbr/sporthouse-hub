import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { disciplineUpdateSchema } from '@/features/freelancers/lib/schemas'
import { DISCIPLINE_COLUMNS } from '@/features/freelancers/lib/columns'

// PATCH (beheren) — label, volgorde of (de)archiveren. Een gearchiveerde
// discipline blijft staan bij wie hem al had, maar is niet meer te kiezen.
// Verwijderen kan niet: freelancers en opdrachten verwijzen ernaar.
export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { key } = await params
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, disciplineUpdateSchema)
  if ('error' in body) return body.error
  const { archived, ...rest } = body.data
  const patch: Record<string, unknown> = { ...rest }
  if (archived !== undefined) patch.archived_at = archived ? new Date().toISOString() : null

  const { data, error } = await auth.supabase.from('freelancer_disciplines')
    .update(patch).eq('key', key).select(DISCIPLINE_COLUMNS).maybeSingle()
  if (error) {
    if (error.code === '23505') return new Response('Dit label bestaat al.', { status: 409 })
    return new Response('Kon de discipline niet opslaan.', { status: 500 })
  }
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}
