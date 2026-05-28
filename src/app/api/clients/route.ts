import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, color, category, logo_url')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}
