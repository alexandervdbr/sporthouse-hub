import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_EMAILS, hasClientAccess } from '@/lib/auth-permissions'
import {
  isDriveStorageConfigured, uploadFile, downloadFile, updateFileContent, moveFile, trashFile,
} from '@/lib/drive-storage'
import { resolveDriveFolderId } from '@/lib/client-files-drive'

export const maxDuration = 60 // prevent hanging

const MAX_SIZE = 500 * 1024 * 1024 // 500 MB, matches proxyClientMaxBodySize in next.config.mjs

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Grants delete/restore for ANY file (all clients). Without it, someone can
// still delete/restore files they personally uploaded — see canManageFile.
function canDeleteFiles(user: { email?: string | null; app_metadata?: Record<string, unknown> }) {
  const permsObj = (user.app_metadata?.permissions as { sections?: string[] } | null) ?? null
  const sections = permsObj?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  return isAdmin || permsObj === null || sections.includes('bestanden_verwijderen')
}

function canManageFile(user: { email?: string | null; app_metadata?: Record<string, unknown> }, uploadedBy: string | null) {
  return canDeleteFiles(user) || (uploadedBy !== null && uploadedBy === user.email)
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
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
  const clientId    = formData.get('clientId') as string | null
  const description = (formData.get('description') as string | null) || null
  const folderId    = (formData.get('folderId') as string | null) || null

  if (!file || !file.name || file.size === 0) {
    return NextResponse.json({ error: 'Geen geldig bestand ontvangen.' }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID ontbreekt.' }, { status: 400 })
  }
  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_SIZE / 1024 / 1024} MB.` }, { status: 400 })
  }

  const admin = adminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })
  }

  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : ''

  const contentType = file.type || 'application/octet-stream'

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Kon bestand niet lezen.' }, { status: 500 })
  }

  let driveFile
  try {
    const driveFolderId = await resolveDriveFolderId(admin, client.id, client.name, folderId)
    driveFile = await uploadFile(buffer, file.name, contentType, driveFolderId)
  } catch (err) {
    console.error('Drive upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Fout bij uploaden naar Drive: ${msg}` }, { status: 500 })
  }

  const { data: record, error: dbError } = await admin
    .from('files')
    .insert({
      client_id: clientId,
      filename: file.name,
      description,
      file_type: ext,
      file_size: file.size,
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
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json(
      { error: `Fout bij opslaan: ${dbError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json(record, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const clientId = searchParams.get('clientId')

  const admin = adminClient()

  if (clientId && !hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  // Trash mode: list this client's soft-deleted files. With bestanden_verwijderen
  // (or admin), see everything; otherwise only your own uploads.
  if (!id && clientId && searchParams.get('trashed') === 'true') {
    let query = admin
      .from('files')
      .select('*')
      .eq('client_id', clientId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (!canDeleteFiles(user)) query = query.eq('uploaded_by', user.email ?? '')

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // List mode: return files for a client + optional folder
  if (!id && clientId) {
    const folderId = searchParams.get('folderId') // 'null' string = root, absent = all
    const all = searchParams.get('all') === 'true'  // global search across all folders

    // When searching globally, include folder name so the UI can show it
    const selectCols = all ? '*, folder:file_folders(id, name)' : '*'

    let query = admin
      .from('files')
      .select(selectCols)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (!all) {
      if (!folderId || folderId === 'null') {
        query = query.is('folder_id', null)
      } else {
        query = query.eq('folder_id', folderId)
      }
    }

    let { data, error } = await query

    // Fallback: if folder_id column doesn't exist yet (SQL not run),
    // return all files for this client so nothing disappears.
    if (error && error.message.includes('folder_id')) {
      const fallback = await admin
        .from('files')
        .select('*')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      data = fallback.data
      error = fallback.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Download/content mode: return signed URL (or plain text) for a single file
  if (!id) return NextResponse.json({ error: 'File ID ontbreekt.' }, { status: 400 })

  const mode = searchParams.get('mode')

  const { data: file, error: fileError } = await admin
    .from('files')
    .select('storage_path, filename, file_type, storage_provider, drive_file_id, client_id')
    .eq('id', id)
    .single()

  if (fileError || !file) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  // 'content' mode: download file server-side and return as plain text
  if (mode === 'content') {
    let buffer: Buffer
    if (file.storage_provider === 'drive') {
      if (!file.drive_file_id) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
      try {
        buffer = await streamToBuffer(await downloadFile(file.drive_file_id))
      } catch {
        return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
      }
    } else {
      const { data: blob, error: dlErr } = await admin.storage
        .from('files')
        .download(file.storage_path)

      if (dlErr || !blob) {
        return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
      }
      buffer = Buffer.from(await blob.arrayBuffer())
    }

    const rawText = buffer.toString('utf-8')
    const ext = (file.file_type ?? '').toLowerCase()

    if (ext === 'rtf') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { parseOffice } = require('officeparser')
        // officeparser v7 returns an OfficeParserAST; .toText() gives plain text
        // with single \n between paragraphs and empty paragraphs dropped.
        // We expand every \n to \n\n so each RTF paragraph gets a visible blank line.
        const ast = await parseOffice(buffer)
        const raw: string = typeof ast === 'string' ? ast : (ast.toText?.() ?? '')
        const plainText = raw
          .replace(/\n/g, '\n\n')       // paragraph break → blank line
          .replace(/\n{4,}/g, '\n\n\n') // cap at two consecutive blank lines
          .trim()
        return new Response(plainText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      } catch {
        return new Response(rawText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    }

    return new Response(rawText, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  // Normal download
  if (file.storage_provider === 'drive') {
    return NextResponse.json({ url: `/api/files/download?id=${id}`, filename: file.filename })
  }

  const { data: signed, error: signError } = await admin.storage
    .from('files')
    .createSignedUrl(file.storage_path, 120, { download: file.filename })

  if (signError || !signed) {
    console.error('Signed URL error:', signError)
    return NextResponse.json({ error: 'Kon download URL niet aanmaken.' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl, filename: file.filename })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'File ID ontbreekt.' }, { status: 400 })

  const body = await request.json()
  const admin = adminClient()

  // Content update: inline text editor
  if ('content' in body) {
    const { data: file } = await admin
      .from('files')
      .select('storage_path, uploaded_by, storage_provider, drive_file_id, client_id')
      .eq('id', id)
      .single()

    if (!file) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
    if (!hasClientAccess(user, file.client_id)) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

    const canEdit = ADMIN_EMAILS.includes(user.email ?? '') || file.uploaded_by === user.email
    if (!canEdit) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

    if (typeof body.content !== 'string') return NextResponse.json({ error: 'Ongeldige inhoud.' }, { status: 400 })

    const bytes = Buffer.from(body.content, 'utf-8')

    if (file.storage_provider === 'drive') {
      if (!file.drive_file_id) return NextResponse.json({ error: 'Bestand niet gevonden in Drive.' }, { status: 404 })
      try {
        await updateFileContent(file.drive_file_id, bytes, 'text/plain; charset=utf-8')
      } catch (err) {
        console.error('Drive content update error:', err)
        return NextResponse.json({ error: 'Fout bij opslaan naar Drive.' }, { status: 500 })
      }
    } else {
      const { error: storErr } = await admin.storage
        .from('files')
        .update(file.storage_path, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true })

      if (storErr) return NextResponse.json({ error: storErr.message }, { status: 500 })
    }

    await admin.from('files').update({ file_size: bytes.byteLength }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // Folder move — the read (for Drive bookkeeping below) and the write don't
  // depend on each other, so run them concurrently instead of back-to-back.
  const { data: file } = await admin.from('files').select('client_id, storage_provider, drive_file_id').eq('id', id).single()
  if (!file) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  if (!hasClientAccess(user, file.client_id)) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

  const { error } = await admin.from('files').update({ folder_id: body.folderId ?? null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort: mirror the move in Drive too. The DB update above already
  // succeeded and is the source of truth for the app, so a Drive hiccup here
  // shouldn't fail the whole request — it just means Drive briefly lags the app.
  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try {
      const { data: client } = await admin.from('clients').select('name').eq('id', file.client_id).single()
      if (client) {
        const targetFolderId = await resolveDriveFolderId(admin, file.client_id, client.name, body.folderId ?? null)
        await moveFile(file.drive_file_id, targetFolderId)
      }
    } catch (err) {
      console.error('Drive move error:', err)
    }
  }

  return NextResponse.json({ success: true })
}

// Soft-delete: moves the file to Drive's own trash and marks the row as
// deleted instead of removing anything outright, so it can be restored from
// the Prullenbak view. Permanent removal only happens via /api/files/purge
// (admin-only) or the 30-day auto-purge cron.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'File ID ontbreekt.' }, { status: 400 })

  const admin = adminClient()

  const { data: file } = await admin
    .from('files')
    .select('storage_provider, drive_file_id, uploaded_by, client_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!file) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  if (!canManageFile(user, file.uploaded_by)) {
    return NextResponse.json({ error: 'Je hebt geen toestemming om dit bestand te verwijderen.' }, { status: 403 })
  }

  let warning: string | null = null
  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try {
      await trashFile(file.drive_file_id)
    } catch (err) {
      console.error('Drive trash error:', err)
      warning = 'Bestand is verwijderd uit de app, maar kon niet naar de prullenbak in Drive verplaatst worden.'
    }
  }

  const { error: dbError } = await admin
    .from('files')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.email })
    .eq('id', id)

  if (dbError) {
    console.error('DB soft-delete error:', dbError)
    return NextResponse.json({ error: 'Fout bij verwijderen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, warning })
}
