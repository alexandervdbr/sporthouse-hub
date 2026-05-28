import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: internClients } = await supabase
    .from('clients')
    .select('id')
    .eq('category', 'intern')

  const ids = (internClients ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return Response.json([])

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, role, email, photo_url')
    .in('client_id', ids)
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}
