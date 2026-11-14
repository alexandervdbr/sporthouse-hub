import { createAdminClient } from '@/lib/supabase/server'
import { requireFreelancers, parseBody, isUuid } from '@/features/freelancers/lib/server'
import { AVATAR_TYPES, avatarConfirmSchema, avatarRequestSchema } from '@/features/freelancers/lib/schemas'
import { FREELANCER_COLUMNS } from '@/features/freelancers/lib/columns'

// Profielfoto, rechtstreeks van de browser naar Supabase Storage — de bytes
// lopen niet meer door deze function. De bucket staat vast (migratie 0093);
// er wordt geen bucket meer opgezocht of aangemaakt.
//
//   POST   {contentType, size} → signed upload-URL + pad (geldig 2 uur)
//   PUT    {path}              → na de upload: controleren, avatar_url zetten,
//                                oude foto's weg
//   DELETE                     → foto weg
// Alles vraagt "beheren".

const BUCKET = 'freelancer-avatars'
type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, avatarRequestSchema)
  if ('error' in body) return body.error

  const path = `${id}/avatar-${Date.now()}.${AVATAR_TYPES[body.data.contentType]}`
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return new Response('Kon de upload niet voorbereiden.', { status: 500 })
  return Response.json({ path, token: data.token, signedUrl: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const body = await parseBody(req, avatarConfirmSchema)
  if ('error' in body) return body.error
  const { path } = body.data
  const name = path.slice(id.length + 1)
  if (!path.startsWith(`${id}/`) || !/^avatar-\d+\.(jpg|png|webp|gif)$/.test(name)) {
    return new Response('Ongeldig pad.', { status: 400 })
  }

  const storage = createAdminClient().storage.from(BUCKET)
  const { data: files } = await storage.list(id)
  if (!files?.some(f => f.name === name)) return new Response('De foto is niet aangekomen.', { status: 400 })

  const old = files.filter(f => f.name !== name).map(f => `${id}/${f.name}`)
  if (old.length) await storage.remove(old)

  const { data: { publicUrl } } = storage.getPublicUrl(path)
  const { data, error } = await auth.supabase.from('freelancers')
    .update({ avatar_url: publicUrl }).eq('id', id)
    .select(FREELANCER_COLUMNS).maybeSingle()
  if (error) return new Response('Kon de foto niet opslaan.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireFreelancers('beheren')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return new Response('Niet gevonden', { status: 404 })

  const storage = createAdminClient().storage.from(BUCKET)
  const { data: files } = await storage.list(id)
  if (files?.length) await storage.remove(files.map(f => `${id}/${f.name}`))

  const { data, error } = await auth.supabase.from('freelancers')
    .update({ avatar_url: null }).eq('id', id)
    .select(FREELANCER_COLUMNS).maybeSingle()
  if (error) return new Response('Kon de foto niet verwijderen.', { status: 500 })
  if (!data) return new Response('Niet gevonden', { status: 404 })
  return Response.json(data)
}
