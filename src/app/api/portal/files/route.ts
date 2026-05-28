import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { filePath, assignmentId } = await req.json()
  const admin = createAdminClient()

  // Verify the file belongs to an assignment of this freelancer
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) return new Response('Not a freelancer', { status: 403 })

  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('id, freelancer_assignments!inner(freelancer_id)')
    .eq('file_url', filePath)
    .eq('assignment_id', assignmentId)
    .eq('freelancer_assignments.freelancer_id', freelancer.id)
    .maybeSingle()

  if (!file) return new Response('Not found', { status: 404 })

  const { data: signed } = await admin.storage
    .from('freelancer-assignments')
    .createSignedUrl(filePath, 3600)

  if (!signed?.signedUrl) return new Response('Could not sign URL', { status: 500 })
  return Response.json({ url: signed.signedUrl })
}
