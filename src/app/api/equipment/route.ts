import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('category')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { name, category, description } = await req.json()
  if (!name?.trim() || !category?.trim()) {
    return new Response('Naam en categorie zijn verplicht', { status: 400 })
  }

  const { data, error } = await supabase
    .from('equipment')
    .insert({ name: name.trim(), category: category.trim(), description: description?.trim() || null })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await req.json()
  if (!id) return new Response('ID ontbreekt', { status: 400 })

  const { error } = await supabase.from('equipment').delete().eq('id', id)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
