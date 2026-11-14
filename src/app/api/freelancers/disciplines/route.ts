import { requireFreelancers, parseBody } from '@/features/freelancers/lib/server'
import { disciplineCreateSchema } from '@/features/freelancers/lib/schemas'
import { DISCIPLINE_COLUMNS } from '@/features/freelancers/lib/columns'
import { slugify } from '@/features/freelancers/lib/slug'

// GET  (bekijken) — de disciplines ("Wat?"). ?alle=1 toont ook gearchiveerde.
// POST (beheren)  — nieuwe discipline; de sleutel volgt uit het label en
//      verandert daarna nooit meer (een label wijzigen mag wel).

export async function GET(req: Request) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  let q = auth.supabase.from('freelancer_disciplines').select(DISCIPLINE_COLUMNS).order('sort').order('label')
  if (new URL(req.url).searchParams.get('alle') !== '1') q = q.is('archived_at', null)
  const { data, error } = await q
  if (error) return new Response('Kon de disciplines niet ophalen.', { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const body = await parseBody(req, disciplineCreateSchema)
  if ('error' in body) return body.error

  const key = slugify(body.data.label)
  if (!key) return new Response('Kies een label met letters of cijfers.', { status: 400 })
  const { data: last } = await auth.supabase.from('freelancer_disciplines').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await auth.supabase.from('freelancer_disciplines')
    .insert({ key, label: body.data.label, sort: ((last?.sort as number | undefined) ?? 0) + 10 })
    .select(DISCIPLINE_COLUMNS).single()
  if (error) {
    if (error.code === '23505') return new Response('Deze discipline bestaat al.', { status: 409 })
    return new Response('Kon de discipline niet opslaan.', { status: 500 })
  }
  return Response.json(data, { status: 201 })
}
