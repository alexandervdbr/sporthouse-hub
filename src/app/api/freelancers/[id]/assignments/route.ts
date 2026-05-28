import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  return isAdmin ? user : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await assertAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .select('*, freelancer_assignment_files(*)')
    .eq('freelancer_id', id)
    .order('deadline', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await assertAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const { title, briefing, deadline, client_name } = await req.json()
  if (!title?.trim()) return new Response('title required', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('freelancer_assignments')
    .insert({
      freelancer_id: id,
      title: title.trim(),
      briefing: briefing?.trim() || null,
      deadline: deadline || null,
      client_name: client_name?.trim() || null,
      created_by: user.email,
      status: 'nieuw',
    })
    .select('*, freelancer_assignment_files(*)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
