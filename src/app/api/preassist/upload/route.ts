import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isDriveStorageConfigured, uploadFile, trashFile, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { isAdminUser } from '@/lib/auth-permissions'

export const maxDuration = 60

const MAX_SIZE = 500 * 1024 * 1024 // 500 MB — Drive can hold far more; the practical
// ceiling is Vercel's serverless request body limit, not this check.

function permissions(user: { email?: string | null; app_metadata?: Record<string, unknown> }) {
  const permsObj = (user.app_metadata?.permissions as { sections?: string[] } | null) ?? null
  const sections = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  const canDeleteAll = isAdmin || permsObj === null || sections.includes('preassist_verwijderen')
  return { isAdmin, canDeleteAll }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!isDriveStorageConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Kon het formulier niet lezen.' }, { status: 400 })
  }

  const file        = formData.get('file') as File | null
  const editionId    = formData.get('editionId') as string | null
  const section      = formData.get('section') as string | null
  const clientId     = formData.get('clientId') as string | null
  const clientName   = formData.get('clientName') as string | null

  if (!file || !file.name || file.size === 0) {
    return NextResponse.json({ error: 'Geen geldig bestand ontvangen.' }, { status: 400 })
  }
  if (!editionId || !section || !clientId || !clientName) {
    return NextResponse.json({ error: 'Editie, sectie en klant zijn verplicht.' }, { status: 400 })
  }
  if (section !== 'content' && section !== 'inspiratie') {
    return NextResponse.json({ error: 'Ongeldige sectie.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Enkel afbeeldingen en video\'s zijn toegelaten.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_SIZE / 1024 / 1024} MB.` }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Kon bestand niet lezen.' }, { status: 500 })
  }

  const admin = createAdminClient()

  const { data: edition } = await admin
    .from('preassist_editions')
    .select('title')
    .eq('id', editionId)
    .single()

  if (!edition) return NextResponse.json({ error: 'Editie niet gevonden.' }, { status: 404 })

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Onbekend'
  const sectionLabel = section === 'content' ? 'Content' : 'Inspiratie'

  let driveFile
  try {
    const folderId = await getOrCreateFolderPath(
      ['Pré-Assist', edition.title, sectionLabel, clientName],
      driveRootFolderId()!
    )
    driveFile = await uploadFile(buffer, `${userName} — ${file.name}`, file.type, folderId)
  } catch (err) {
    console.error('Pré-assist Drive upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Fout bij uploaden naar Drive: ${msg}` }, { status: 500 })
  }

  const { data: record, error: dbError } = await admin
    .from('preassist_submissions')
    .insert({
      edition_id: editionId,
      section,
      title: null,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      submitted_by_id: user.id,
      submitted_by_name: userName,
      client_id: clientId,
      client_name: clientName,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      web_view_link: driveFile.webViewLink,
      web_content_link: driveFile.webContentLink,
      thumbnail_link: driveFile.thumbnailLink,
    })
    .select()
    .single()

  if (dbError) {
    console.error('Pré-assist DB insert error:', dbError)
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json({ error: `Fout bij opslaan: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json(record, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('preassist_submissions')
    .select('drive_file_id, submitted_by_id')
    .eq('id', id)
    .single()

  if (!submission) return NextResponse.json({ error: 'Niet gevonden.' }, { status: 404 })

  const { isAdmin, canDeleteAll } = permissions(user)
  if (!isAdmin && !canDeleteAll && submission.submitted_by_id !== user.id) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (submission.drive_file_id) {
    try { await trashFile(submission.drive_file_id) } catch { /* may already be gone */ }
  }

  const { error } = await admin.from('preassist_submissions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
