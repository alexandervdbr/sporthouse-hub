import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { uploadFile, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { hasClientAccess } from '@/lib/auth-permissions'

export const maxDuration = 60

// A poster is a video frame the browser captured during upload. It's small by
// construction (a single JPEG at most 1024px), so this cap only exists to
// stop the route being used as a general file upload.
const MAX_POSTER_BYTES = 2 * 1024 * 1024

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Stores the thumbnail the browser made for a video. Kept out of the user's
// own folders — these are machinery, not files anyone uploaded, and showing
// them next to the real ones in Drive would be confusing.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const form = await request.formData()
  const id = form.get('id')
  const poster = form.get('poster')

  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })
  }
  if (!(poster instanceof File)) {
    return NextResponse.json({ error: 'Voorbeeld ontbreekt.' }, { status: 400 })
  }
  if (poster.size > MAX_POSTER_BYTES) {
    return NextResponse.json({ error: 'Voorbeeld te groot.' }, { status: 400 })
  }
  if (poster.type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Voorbeeld moet een JPEG zijn.' }, { status: 400 })
  }

  const admin = adminClient()
  const { data: file } = await admin
    .from('files')
    .select('client_id, poster_drive_file_id')
    .eq('id', id)
    .single()

  if (!file) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }
  // Written once, right after upload. Refusing a second write keeps this from
  // becoming a way to swap the preview of someone else's file later on.
  if (file.poster_drive_file_id) {
    return NextResponse.json({ error: 'Voorbeeld bestaat al.' }, { status: 409 })
  }

  const root = driveRootFolderId()
  if (!root) return NextResponse.json({ error: 'Drive niet geconfigureerd.' }, { status: 500 })

  try {
    const buffer = Buffer.from(await poster.arrayBuffer())
    const folderId = await getOrCreateFolderPath(['Videovoorbeelden'], root)
    const uploaded = await uploadFile(buffer, `${id}.jpg`, 'image/jpeg', folderId)

    await admin.from('files').update({ poster_drive_file_id: uploaded.id }).eq('id', id)

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('Kon videovoorbeeld niet opslaan:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kon voorbeeld niet opslaan.' }, { status: 500 })
  }
}
