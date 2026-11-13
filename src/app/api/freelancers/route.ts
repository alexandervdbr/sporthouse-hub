import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { freelancerCreateSchema } from '@/features/freelancers/lib/schemas'

export async function GET() {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('freelancers')
    .select('*, freelancer_projects(id, score)')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

// Maakt alleen het freelancerprofiel aan. Er wordt bewust GEEN Auth-account
// meer gemaakt: freelancers krijgen geen login (zie
// docs/freelancers-redesign.md). Wie vroeger zo'n account kreeg, behoudt het
// tot Fase 6 van het herontwerp; nieuwe freelancers krijgen er geen.
export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const body = await parseBody(req, freelancerCreateSchema)
  if ('error' in body) return body.error
  const f = body.data

  const { data, error } = await auth.supabase
    .from('freelancers')
    .insert({
      name: f.name,
      email: f.email ?? null,
      phone: f.phone ?? null,
      types: f.types ?? [],
      tested: f.tested ?? null,
      price_info: f.price_info ?? null,
      rating: f.rating ?? null,
      portfolio_url: f.portfolio_url ?? null,
      notes: f.notes ?? null,
    })
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
