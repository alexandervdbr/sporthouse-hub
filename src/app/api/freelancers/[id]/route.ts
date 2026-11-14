import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { freelancerUpdateSchema } from '@/features/freelancers/lib/schemas'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const { error } = await auth.supabase.from('freelancers').delete().eq('id', id)
  if (error) {
    // 23503 = foreign_key_violation — this freelancer still has logged
    // projects or assignments, which we deliberately don't cascade away
    // (unlike a client delete, there's no promise anywhere that this wipes
    // history).
    if (error.code === '23503') {
      return new Response('Deze freelancer heeft nog gekoppelde projecten of opdrachten en kan niet verwijderd worden. Verwijder eerst die koppelingen.', { status: 409 })
    }
    return new Response(error.message, { status: 500 })
  }
  return new Response(null, { status: 204 })
}

// Alleen de velden uit freelancerUpdateSchema. Vroeger ging de hele body
// ongefilterd naar .update(), dus ook id, created_at of avatar_url.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error

  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, freelancerUpdateSchema)
  if ('error' in body) return body.error

  const { data, error } = await auth.supabase
    .from('freelancers')
    .update(body.data)
    .eq('id', id)
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
