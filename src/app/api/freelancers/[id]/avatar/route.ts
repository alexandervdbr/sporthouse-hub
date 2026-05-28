import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireFreelancerAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const ok = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer') || sections.includes('freelancers')
  return ok ? user : null
}

const BUCKET = 'freelancer-avatars'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params

  let formData: FormData
  try { formData = await req.formData() } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return new Response('No file', { status: 400 })
  if (file.size > 5 * 1024 * 1024) return new Response('Max 5 MB', { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  if (!allowed.includes(ext)) return new Response('Alleen afbeeldingen toegestaan', { status: 400 })

  const admin = adminClient()

  // Ensure bucket exists (public)
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: true })
  }

  const storagePath = `${id}/avatar.${ext}`

  // Remove old avatar files for this freelancer (any extension)
  const { data: existing } = await admin.storage.from(BUCKET).list(id)
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${id}/${f.name}`))
  }

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return new Response(uploadError.message, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(storagePath)

  // Bust cache by appending a timestamp param
  const avatarUrl = `${publicUrl}?t=${Date.now()}`

  const { data, error } = await admin
    .from('freelancers')
    .update({ avatar_url: avatarUrl })
    .eq('id', id)
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireFreelancerAdmin()
  if (!user) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const admin = adminClient()

  const { data: existing } = await admin.storage.from(BUCKET).list(id)
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${id}/${f.name}`))
  }

  const { data, error } = await admin
    .from('freelancers')
    .update({ avatar_url: null })
    .eq('id', id)
    .select('*, freelancer_projects(id, score)')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}
