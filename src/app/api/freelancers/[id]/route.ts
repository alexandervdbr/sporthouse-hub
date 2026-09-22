import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

async function requireFreelancerAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.app_metadata?.permissions?.sections ?? []
  const ok = isAdminUser(user) || sections.includes('freelancers')
  return ok ? user : null
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const supabase = await createClient()
  const { id } = await params
  const { error } = await supabase.from('freelancers').delete().eq('id', id)
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('freelancers')
    .update(body)
    .eq('id', id)
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
