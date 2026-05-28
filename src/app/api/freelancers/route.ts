import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('freelancers')
    .select('*, freelancer_projects(id, score)')
    .order('name')

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { name, email, phone, specialties, hourly_rate, bio,
          types, tested, price_info, rating, portfolio_url, notes } = body
  if (!name?.trim()) return new Response('Name required', { status: 400 })

  const { data, error } = await supabase
    .from('freelancers')
    .insert({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      specialties: specialties ?? [],
      hourly_rate: hourly_rate || null,
      bio: bio?.trim() || null,
      types: types ?? [],
      tested: tested || null,
      price_info: price_info?.trim() || null,
      rating: rating || null,
      portfolio_url: portfolio_url?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })

  // Pre-create Supabase Auth account so freelancer can log in when signups are disabled
  if (email?.trim()) {
    const admin = createAdminClient()
    await admin.auth.admin.createUser({
      email: email.trim(),
      user_metadata: { freelancer: true, full_name: name.trim() },
      email_confirm: true,
    })
    // Ignore error if user already exists
  }

  return Response.json(data, { status: 201 })
}
