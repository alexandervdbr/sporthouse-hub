import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { freelancerCreateSchema } from '@/features/freelancers/lib/schemas'
import { FREELANCER_COLUMNS, STATS_COLUMNS } from '@/features/freelancers/lib/columns'

// GET  (bekijken) — de lijst, met de cijfers uit freelancer_stats.
//      ?archief=1 geeft alleen de gearchiveerden.
// POST (beheren)  — een nieuwe freelancer. Er wordt GEEN Auth-account
//      gemaakt: freelancers krijgen een persoonlijke link, geen login.
export async function GET(req: Request) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const archief = new URL(req.url).searchParams.get('archief') === '1'
  let q = auth.supabase.from('freelancers').select(FREELANCER_COLUMNS).order('name')
  q = archief ? q.not('archived_at', 'is', null) : q.is('archived_at', null)

  const [{ data: freelancers, error }, { data: stats }] = await Promise.all([
    q,
    auth.supabase.from('freelancer_stats').select(STATS_COLUMNS),
  ])
  if (error) return new Response('Kon de freelancers niet ophalen.', { status: 500 })

  const byId = new Map((stats ?? []).map(s => [s.freelancer_id as string, s]))
  return Response.json((freelancers ?? []).map(f => {
    const row = f as unknown as Record<string, unknown>
    return { ...row, stats: byId.get(row.id as string) ?? null }
  }))
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

  if (error) {
    if (error.code === '23505') return new Response('Er bestaat al een freelancer met dit e-mailadres.', { status: 409 })
    if (error.code === '23503') return new Response('Een van de disciplines bestaat niet.', { status: 400 })
    return new Response('Kon de freelancer niet opslaan.', { status: 500 })
  }
  return Response.json(data, { status: 201 })
}
