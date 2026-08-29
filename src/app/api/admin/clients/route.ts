import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'

const CATEGORIES = ['klant', 'atleet', 'podcast', 'intern']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return isAdminUser(user) ? user : null
}

// GET — list all clients (admin management view)
export async function GET() {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('clients').select('*').order('name')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

// POST — create a new client
export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { name, category, color, logo_url, description } = await req.json()
  if (!name?.trim()) return new Response('Naam is verplicht.', { status: 400 })
  if (!CATEGORIES.includes(category)) return new Response('Ongeldige categorie.', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .insert({
      name: name.trim(),
      category,
      color: color?.trim() || '#3b82f6',
      logo_url: logo_url?.trim() || null,
      description: description?.trim() || null,
    })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data, { status: 201 })
}
