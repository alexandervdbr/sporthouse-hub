import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { uploadFile, downloadFile, updateFileContent, moveFile, trashFile, isSporthouseDriveConfigured } from '@/lib/drive-storage'
import { resolveSporthouseDriveFolderId } from '@/lib/sporthouse-docs-drive'
import { canViewSection, canManageSection, isSporthouseSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import { isAllowedUploadExt, ALLOWED_UPLOAD_HINT } from '@/lib/upload-policy'

export const maxDuration = 60

const MAX_SIZE = 500 * 1024 * 1024 // 500 MB, matches proxyClientMaxBodySize in next.config.mjs

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

// Mirrors /api/files for Sporthouse Intern documents: same query contract, so
// the shared FileManager component works unchanged against either backend.
// Differences are deliberate and all in the same direction — a stricter
// permission model (section-based, no "own uploads" exception) and a separate,
// fully private Shared Drive where nothing is ever shared publicly.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const section = searchParams.get('section')
  const admin = createAdminClient()

  // --- List modes (section-scoped) ---
  if (!id) {
    if (!isSporthouseSection(section)) return NextResponse.json({ error: 'section ontbreekt.' }, { status: 400 })
    if (!canViewSection(user, section)) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

    if (searchParams.get('trashed') === 'true') {
      const { data, error } = await admin
        .from('sporthouse_documents')
        .select('*')
        .eq('section', section)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data ?? [])
    }

    const all = searchParams.get('all') === 'true'
    const folderId = searchParams.get('folderId') // 'null' string = root

    let query = admin
      .from('sporthouse_documents')
      .select(all ? '*, folder:sporthouse_document_folders(id, name)' : '*')
      .eq('section', section)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (!all) {
      query = !folderId || folderId === 'null'
        ? query.is('folder_id', null)
        : query.eq('folder_id', folderId)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // --- Single document: content (inline editor) or a download URL ---
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, filename, file_type, storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canViewSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (searchParams.get('mode') === 'content') {
    let buffer: Buffer
    if (doc.storage_provider === 'drive') {
      if (!doc.drive_file_id) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
      try {
        buffer = await streamToBuffer(await downloadFile(doc.drive_file_id))
      } catch {
        return NextResponse.json({ error: 'Kon document niet downloaden.' }, { status: 500 })
      }
    } else {
      if (!doc.storage_path) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
      const { data: blob, error: dlErr } = await admin.storage.from('sporthouse-internal').download(doc.storage_path)
      if (dlErr || !blob) return NextResponse.json({ error: 'Kon document niet downloaden.' }, { status: 500 })
      buffer = Buffer.from(await blob.arrayBuffer())
    }
    return new Response(buffer.toString('utf-8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  // Always our own streaming route — these files have no public Drive link by
  // design, so this is the only way to reach the bytes.
  return NextResponse.json({ url: `/api/sporthouse/documents/download?id=${id}`, filename: doc.filename })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!isSporthouseDriveConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Kon het formulier niet lezen.' }, { status: 400 })
  }

  const file        = formData.get('file') as File | null
  const section     = formData.get('section') as string | null
  const description = (formData.get('description') as string | null) || null
  const folderId    = (formData.get('folderId') as string | null) || null

  if (!isSporthouseSection(section)) return NextResponse.json({ error: 'section ontbreekt.' }, { status: 400 })
  if (!canManageSection(user, section)) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  if (!file || !file.name || file.size === 0) {
    return NextResponse.json({ error: 'Geen geldig bestand ontvangen.' }, { status: 400 })
  }
  if (!isAllowedUploadExt(file.name)) {
    return NextResponse.json({ error: `Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_UPLOAD_HINT}.` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_SIZE / 1024 / 1024} MB.` }, { status: 400 })
  }

  const admin = createAdminClient()
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Kon bestand niet lezen.' }, { status: 500 })
  }

  let driveFile
  try {
    const driveFolderId = await resolveSporthouseDriveFolderId(admin, section, folderId)
    driveFile = await uploadFile(buffer, file.name, file.type || 'application/octet-stream', driveFolderId, { public: false })
  } catch (err) {
    console.error('Drive upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Fout bij uploaden naar Drive: ${msg}` }, { status: 500 })
  }

  const { data: record, error: dbError } = await admin
    .from('sporthouse_documents')
    .insert({
      section,
      filename: file.name,
      description,
      file_type: ext,
      file_size: file.size,
      folder_id: folderId,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      uploaded_by: user.email,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    // To the bin, not files.delete(): the service account is Content manager
    // on the Shared Drive and may not permanently delete, so a delete here
    // would fail silently and leave an orphan behind.
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json({ error: `Fout bij opslaan: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json(record, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document ID ontbreekt.' }, { status: 400 })

  const body = await request.json()
  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canManageSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  // Content update: inline text editor
  if ('content' in body) {
    if (typeof body.content !== 'string') return NextResponse.json({ error: 'Ongeldige inhoud.' }, { status: 400 })
    const bytes = Buffer.from(body.content, 'utf-8')

    if (doc.storage_provider === 'drive') {
      if (!doc.drive_file_id) return NextResponse.json({ error: 'Document niet gevonden in Drive.' }, { status: 404 })
      try {
        await updateFileContent(doc.drive_file_id, bytes, 'text/plain; charset=utf-8')
      } catch (err) {
        console.error('Drive content update error:', err)
        return NextResponse.json({ error: 'Fout bij opslaan naar Drive.' }, { status: 500 })
      }
    } else {
      if (!doc.storage_path) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
      const { error: storErr } = await admin.storage
        .from('sporthouse-internal')
        .update(doc.storage_path, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true })
      if (storErr) return NextResponse.json({ error: storErr.message }, { status: 500 })
    }

    await admin.from('sporthouse_documents').update({ file_size: bytes.byteLength }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // Folder move. A document may only move within its own section, so a crafted
  // folderId can't drag a finance document into administration.
  const targetFolderId = body.folderId ?? null
  if (targetFolderId) {
    const { data: folder } = await admin
      .from('sporthouse_document_folders')
      .select('section')
      .eq('id', targetFolderId)
      .single()
    if (!folder) return NextResponse.json({ error: 'Map niet gevonden.' }, { status: 404 })
    if (folder.section !== doc.section) {
      return NextResponse.json({ error: 'Map hoort bij een andere sectie.' }, { status: 400 })
    }
  }

  const { error } = await admin
    .from('sporthouse_documents')
    .update({ folder_id: targetFolderId })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best effort: the DB is the source of truth for the app, so a Drive hiccup
  // here just means Drive briefly lags behind.
  if (doc.storage_provider === 'drive' && doc.drive_file_id) {
    try {
      const driveFolderId = await resolveSporthouseDriveFolderId(admin, doc.section as SporthouseSection, targetFolderId)
      await moveFile(doc.drive_file_id, driveFolderId)
    } catch (err) {
      console.error('Drive move error:', err)
    }
  }

  return NextResponse.json({ success: true })
}

// Soft-delete: the document goes to Drive's own bin and the row is marked
// rather than removed, so it can be restored from the Prullenbak. Permanent
// removal happens via /purge or the 30-day cron.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canManageSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  let warning: string | null = null
  if (doc.storage_provider === 'drive' && doc.drive_file_id) {
    try {
      await trashFile(doc.drive_file_id)
    } catch (err) {
      console.error('Drive trash error:', err)
      warning = 'Document is verwijderd uit de app, maar kon niet naar de prullenbak in Drive verplaatst worden.'
    }
  } else if (doc.storage_path) {
    await admin.storage.from('sporthouse-internal').remove([doc.storage_path])
  }

  const { error } = await admin
    .from('sporthouse_documents')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.email })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, warning })
}
