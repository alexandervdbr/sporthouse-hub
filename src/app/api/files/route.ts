import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const maxDuration = 60 // prevent hanging

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Sanitize filename for safe storage paths while keeping original for display
function safeStorageName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-zA-Z0-9._-]/g, '_') // replace unsafe chars with _
    .replace(/_+/g, '_')              // collapse multiple underscores
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Kon het formulier niet lezen.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const clientId = formData.get('clientId') as string | null
  const description = (formData.get('description') as string | null) || null

  if (!file || !file.name || file.size === 0) {
    return NextResponse.json({ error: 'Geen geldig bestand ontvangen.' }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID ontbreekt.' }, { status: 400 })
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'Bestand mag niet groter zijn dan 100 MB.' }, { status: 400 })
  }

  const admin = adminClient()

  // Verify client exists
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })
  }

  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : ''

  const safeName = safeStorageName(file.name)
  const storagePath = `${clientId}/${Date.now()}-${safeName}`
  const contentType = file.type || 'application/octet-stream'

  // Convert File to Buffer — the Supabase SDK doesn't reliably handle
  // File/Blob objects in a Node.js server context
  let buffer: Buffer
  try {
    const arrayBuffer = await file.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } catch {
    return NextResponse.json({ error: 'Kon bestand niet lezen.' }, { status: 500 })
  }

  // Upload to Supabase Storage
  const { error: uploadError } = await admin.storage
    .from('files')
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    return NextResponse.json(
      { error: `Fout bij uploaden: ${uploadError.message}` },
      { status: 500 }
    )
  }

  // Save metadata to database
  const { data: record, error: dbError } = await admin
    .from('files')
    .insert({
      client_id: clientId,
      filename: file.name,   // original name for display
      description,
      file_type: ext,
      file_size: file.size,
      storage_path: storagePath,
      uploaded_by: user.email,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    // Clean up storage on DB failure
    await admin.storage.from('files').remove([storagePath])
    return NextResponse.json(
      { error: `Fout bij opslaan: ${dbError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: record.id, filename: record.filename })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const clientId = searchParams.get('clientId')

  const admin = adminClient()

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
    .select('storage_path, filename, file_type')
    .eq('id', id)
    .single()

  if (fileError || !file) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }

  // 'content' mode: download file server-side and return as plain text
  if (mode === 'content') {
    const { data: blob, error: dlErr } = await admin.storage
      .from('files')
      .download(file.storage_path)

    if (dlErr || !blob) {
      return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
    }

    const rawText = await blob.text()
    const ext = (file.file_type ?? '').toLowerCase()

    if (ext === 'rtf') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { parseOffice } = require('officeparser')
        const arrayBuffer = await blob.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
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

  // Normal download: signed URL with forced download header
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
      .select('storage_path, uploaded_by')
      .eq('id', id)
      .single()

    if (!file) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })

    const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']
    const canEdit = ADMIN_EMAILS.includes(user.email ?? '') || file.uploaded_by === user.email
    if (!canEdit) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

    if (typeof body.content !== 'string') return NextResponse.json({ error: 'Ongeldige inhoud.' }, { status: 400 })

    const bytes = Buffer.from(body.content, 'utf-8')
    const { error: storErr } = await admin.storage
      .from('files')
      .update(file.storage_path, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true })

    if (storErr) return NextResponse.json({ error: storErr.message }, { status: 500 })

    await admin.from('files').update({ file_size: bytes.byteLength }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // Folder move
  const { error } = await admin
    .from('files')
    .update({ folder_id: body.folderId ?? null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

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
    .select('storage_path, uploaded_by')
    .eq('id', id)
    .single()

  if (!file) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }

  if (file.uploaded_by !== user.email) {
    return NextResponse.json({ error: 'Je kan alleen je eigen bestanden verwijderen.' }, { status: 403 })
  }

  if (file?.storage_path) {
    const { error: storageError } = await admin.storage
      .from('files')
      .remove([file.storage_path])
    if (storageError) {
      console.error('Storage delete error:', storageError)
    }
  }

  const { error: dbError } = await admin.from('files').delete().eq('id', id)
  if (dbError) {
    console.error('DB delete error:', dbError)
    return NextResponse.json({ error: 'Fout bij verwijderen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
