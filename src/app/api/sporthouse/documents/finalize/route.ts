import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFileMetadata } from '@/lib/drive-storage'
import { canManageSection, isSporthouseSection } from '@/lib/sporthouse-docs'

// Called once the browser has PUT the bytes straight to the Drive session URL
// from /upload-session. Only writes the metadata row, using canonical file
// info fetched from Drive with our own credentials rather than whatever the
// client claims.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const section = body?.section as string | undefined
  const folderId = (body?.folderId as string | null | undefined) ?? null
  const description = (body?.description as string | null | undefined) || null
  const driveFileId = body?.driveFileId as string | undefined

  if (!isSporthouseSection(section ?? null)) return NextResponse.json({ error: 'section ontbreekt.' }, { status: 400 })
  if (!canManageSection(user, section as 'finance' | 'administration')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }
  if (!driveFileId) return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })

  let driveFile
  try {
    driveFile = await getFileMetadata(driveFileId)
  } catch (err) {
    console.error('Kon geüpload Drive-bestand niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon geüpload bestand niet verifiëren.' }, { status: 500 })
  }

  const ext = driveFile.name.includes('.') ? driveFile.name.split('.').pop()!.toLowerCase() : ''

  const admin = createAdminClient()
  const { data: record, error: dbError } = await admin
    .from('sporthouse_documents')
    .insert({
      section,
      filename: driveFile.name,
      description,
      file_type: ext,
      file_size: driveFile.size ? Number(driveFile.size) : 0,
      folder_id: folderId,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      uploaded_by: user.email,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    return NextResponse.json({ error: `Fout bij opslaan: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json(record, { status: 201 })
}
