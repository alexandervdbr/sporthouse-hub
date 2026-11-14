import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { assignmentUpdateSchema } from '@/features/freelancers/lib/schemas'
import { ASSIGNMENT_COLUMNS, EVENT_COLUMNS, FILE_COLUMNS, REVIEW_COLUMNS } from '@/features/freelancers/lib/columns'
import { nextTransitions, isAssignmentStatus } from '@/features/freelancers/lib/statuses'

// GET   (bekijken) — één opdracht met bijlagen, activiteit, review en de
//       acties die het team vanuit deze status kan doen.
// PATCH (beheren)  — velden aanpassen. Van freelancer wisselen kan alleen
//       zolang de opdracht een concept is. De status wijzigt hier NIET
//       (daarvoor: /transition).
type Ctx = { params: Promise<{ id: string }> }
const DETAIL_SELECT = `${ASSIGNMENT_COLUMNS}, freelancer:freelancers(id, name, email, phone), client:clients(id, name), `
  + `files:freelancer_assignment_files(${FILE_COLUMNS}), events:freelancer_assignment_events(${EVENT_COLUMNS}), `
  + `review:freelancer_reviews(${REVIEW_COLUMNS})`

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('bekijken')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { data, error } = await auth.supabase.from('freelancer_assignments')
    .select(DETAIL_SELECT).eq('id', id)
    .order('created_at', { referencedTable: 'freelancer_assignment_events', ascending: false })
    .maybeSingle()
  if (error) return new Response('Kon de opdracht niet ophalen.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })

  const row = data as unknown as Record<string, unknown>
  const status = row.status
  const actions = isAssignmentStatus(status) ? nextTransitions(status, 'team').map(t => ({ to: t.to, action: t.action, message: t.message })) : []
  return Response.json({ ...row, actions })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, assignmentUpdateSchema)
  if ('error' in body) return body.error

  let q = auth.supabase.from('freelancer_assignments').update(body.data).eq('id', id)
  if (body.data.freelancer_id) q = q.eq('status', 'concept')
  const { data, error } = await q.select(ASSIGNMENT_COLUMNS).maybeSingle()
  if (error) {
    if (error.code === '23503') return new Response('Freelancer, klant of discipline bestaat niet.', { status: 400 })
    return new Response('Kon de opdracht niet opslaan.', { status: 500 })
  }
  if (!data) {
    return new Response(body.data.freelancer_id ? 'Van freelancer wisselen kan alleen bij een concept.' : 'Niet gevonden', {
      status: body.data.freelancer_id ? 409 : 404,
    })
  }
  return Response.json(data)
}
