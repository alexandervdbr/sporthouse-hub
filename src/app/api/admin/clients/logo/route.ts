import crypto from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import { CLIENT_LOGO_BUCKET, CLIENT_LOGO_MAX_BYTES, CLIENT_LOGO_TYPES } from '@/lib/client-logos'

// POST — één logo uploaden, antwoordt met de publieke URL. Het formulier zet
// die daarna als logo_url bij het opslaan van de klant, zodat dit ook werkt
// voor een klant die nog niet bestaat.
//
// De browser verkleint het beeld eerst tot max. 256 px; wat hier aankomt is
// dus klein, en een nieuwe naam per upload laat het altijd cachen.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('logo')
  if (!(file instanceof File)) return new Response('Geen bestand ontvangen.', { status: 400 })
  const ext = CLIENT_LOGO_TYPES[file.type]
  if (!ext) return new Response('Kies een PNG-, JPG- of WebP-afbeelding.', { status: 400 })
  if (file.size > CLIENT_LOGO_MAX_BYTES) return new Response('Het logo is te groot (max. 1 MB).', { status: 400 })

  const admin = createAdminClient()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await admin.storage
    .from(CLIENT_LOGO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) {
    const hint = /bucket/i.test(error.message) ? ' Staat migratie 0067_client_logos_bucket.sql al in de database?' : ''
    return new Response(`Uploaden mislukt: ${error.message}.${hint}`, { status: 500 })
  }

  const { data } = admin.storage.from(CLIENT_LOGO_BUCKET).getPublicUrl(path)
  return Response.json({ url: data.publicUrl })
}
