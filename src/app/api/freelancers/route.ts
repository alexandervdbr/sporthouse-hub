import { requireFreelancers, parseBody, writeError } from '@/features/freelancers/lib/server'
import { freelancerCreateSchema } from '@/features/freelancers/lib/schemas'
import { FREELANCER_COLUMNS, LIST_COLUMNS } from '@/features/freelancers/lib/columns'
import { toListRow } from '@/features/freelancers/lib/rows'

// GET  (bekijken) — de hele lijst in één verzoek, met per freelancer het
//      gemiddelde van zijn samenwerkingen. Standaard zonder gearchiveerden;
//      ?archief=1 geeft iedereen.
// POST (beheren)  — een nieuwe freelancer. Er wordt nooit een Auth-account
//      gemaakt: freelancers hebben geen login.
export async function GET(req: Request) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const archief = new URL(req.url).searchParams.get('archief') === '1'
  let q = auth.supabase.from('freelancers').select(LIST_COLUMNS).order('name')
  if (!archief) q = q.is('archived_at', null)

  const { data, error } = await q
  if (error) return new Response('Kon de freelancers niet ophalen.', { status: 500 })
  return Response.json((data ?? []).map(r => toListRow(r as unknown as Record<string, unknown> & { freelancer_projects?: { score: number | null }[] })))
}

export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const body = await parseBody(req, freelancerCreateSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase
    .from('freelancers')
    .insert(body.data)
    .select(FREELANCER_COLUMNS)
    .single()

  if (error) return writeError(error, 'Kon de freelancer niet opslaan.')
  return Response.json({ ...(data as unknown as Record<string, unknown>), collab: { avg: null, count: 0, scored: 0 } }, { status: 201 })
}
