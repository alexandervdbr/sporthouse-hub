import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getFileMetadata } from '@/lib/drive-storage'
import { hasClientAccess } from '@/lib/auth-permissions'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called once the browser has PUT the file bytes straight to the Drive
// session URL from /api/files/upload-session — this only writes the
// Supabase metadata row, using canonical file info fetched from Drive with
// our own credentials (not whatever the client claims).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const clientId = body?.clientId as string | undefined
  const folderId = (body?.folderId as string | null | undefined) ?? null
  const description = (body?.description as string | null | undefined) || null
  const driveFileId = body?.driveFileId as string | undefined

  if (!clientId || !driveFileId) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  const admin = adminClient()
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single()
  if (!client) return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })

  let driveFile
  try {
    driveFile = await getFileMetadata(driveFileId)
  } catch (err) {
    console.error('Kon geüpload Drive-bestand niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon geüpload bestand niet verifiëren.' }, { status: 500 })
  }

  const ext = driveFile.name.includes('.') ? driveFile.name.split('.').pop()!.toLowerCase() : ''

  const { data: record, error: dbError } = await admin
    .from('files')
    .insert({
      client_id: clientId,
      filename: driveFile.name,
      description,
      file_type: ext,
      file_size: driveFile.size ? Number(driveFile.size) : 0,
      uploaded_by: user.email,
      folder_id: folderId,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      web_view_link: driveFile.webViewLink,
      web_content_link: driveFile.webContentLink,
      thumbnail_link: driveFile.thumbnailLink,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    return NextResponse.json({ error: `Fout bij opslaan: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json(record, { status: 201 })
}
