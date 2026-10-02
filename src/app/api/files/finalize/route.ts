import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getFileMetadata, trashFile, getResumableUploadResult } from '@/lib/drive-storage'
import { resolveDriveFolderId } from '@/lib/client-files-drive'
import { hasClientAccess } from '@/lib/auth-permissions'
import { isAllowedUploadExt, ALLOWED_UPLOAD_HINT } from '@/lib/upload-policy'

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
  const uploadUrl = body?.uploadUrl as string | undefined
  const fileSize = Number(body?.fileSize)

  if (!clientId || !uploadUrl || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  // The session URL is handed back by the browser, so it's checked the same
  // way the old relay checked it: nothing but a Drive upload session gets to
  // be PUT to from here.
  if (!uploadUrl.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
    return NextResponse.json({ error: 'Ongeldige upload-URL.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  const admin = adminClient()
  const { data: client } = await admin.from('clients').select('id, name').eq('id', clientId).single()
  if (!client) return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })

  // The browser sends the bytes straight to Google, and the response to its
  // last chunk carries no CORS headers — so it can see the upload land but
  // not what it became. Asking the session from here gets both the answer and
  // an id we didn't take on the client's word.
  let driveFileId: string
  try {
    const result = await getResumableUploadResult(uploadUrl, fileSize)
    if (!result.done) {
      return NextResponse.json(
        { error: 'Upload is nog niet volledig aangekomen.', receivedBytes: result.receivedBytes },
        { status: 409 }
      )
    }
    driveFileId = result.fileId
  } catch (err) {
    console.error('Kon uploadsessie niet afronden:', err)
    return NextResponse.json({ error: 'Kon de upload niet afronden.' }, { status: 502 })
  }

  let driveFile
  try {
    driveFile = await getFileMetadata(driveFileId)
  } catch (err) {
    console.error('Kon geüpload Drive-bestand niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon geüpload bestand niet verifiëren.' }, { status: 500 })
  }

  // Confirm it actually landed in the folder this request claims. The id now
  // comes from a session we opened ourselves, but the folder in the body is
  // still the caller's to choose — without this, a row could be written
  // pointing at a file that belongs somewhere else entirely.
  try {
    const expectedParent = await resolveDriveFolderId(admin, clientId, client.name, folderId)
    if (!driveFile.parents?.includes(expectedParent)) {
      return NextResponse.json({ error: 'Upload hoort niet bij deze map.' }, { status: 400 })
    }
  } catch (err) {
    console.error('Kon doelmap niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon de doelmap niet verifiëren.' }, { status: 500 })
  }

  if (!isAllowedUploadExt(driveFile.name)) {
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json({ error: `Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_UPLOAD_HINT}.` }, { status: 400 })
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
