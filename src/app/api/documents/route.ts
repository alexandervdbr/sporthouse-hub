import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { hasClientAccess } from '@/lib/auth-permissions'
import { isAllowedTextDocExt, ALLOWED_TEXT_DOC_HINT } from '@/lib/upload-policy'

async function extractText(file: File): Promise<string> {
  const text = await file.text()

  // For PDF files, we just store the raw text (real PDF parsing would need pdf-parse or similar)
  // In production, you'd use a proper PDF parser
  return text
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const clientId = formData.get('clientId') as string

  if (!file || !clientId) {
    return NextResponse.json({ error: 'Bestand of client ID ontbreekt.' }, { status: 400 })
  }
  if (!isAllowedTextDocExt(file.name)) {
    return NextResponse.json({ error: `Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_TEXT_DOC_HINT}.` }, { status: 400 })
  }

  if (!hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  // Verify client exists
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })
  }

  // Extract text content
  let content: string
  try {
    content = await extractText(file)
  } catch {
    return NextResponse.json({ error: 'Kon bestand niet verwerken.' }, { status: 400 })
  }

  if (!content.trim()) {
    return NextResponse.json({ error: 'Bestand is leeg of kon niet worden gelezen.' }, { status: 400 })
  }

  // Upload file to Supabase Storage
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const fileName = `${clientId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await adminClient.storage
    .from('documents')
    .upload(fileName, file)

  let fileUrl: string | null = null
  if (!uploadError) {
    const { data: urlData } = adminClient.storage
      .from('documents')
      .getPublicUrl(fileName)
    fileUrl = urlData.publicUrl
  }

  // Store document in database
  const title = file.name.replace(/\.[^/.]+$/, '') // Remove extension

  const { data: document, error: dbError } = await adminClient
    .from('documents')
    .insert({
      title,
      content: content.slice(0, 100000), // Limit content size
      client_id: clientId,
      file_url: fileUrl,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'Fout bij opslaan in database.' }, { status: 500 })
  }

  return NextResponse.json({ id: document.id, title: document.title })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Document ID ontbreekt.' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get document to find file_url (and confirm which client it belongs to)
  const { data: doc } = await adminClient
    .from('documents')
    .select('file_url, client_id')
    .eq('id', id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  }
  if (!hasClientAccess(user, doc.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  // Delete from storage if exists
  if (doc?.file_url) {
    const path = doc.file_url.split('/documents/')[1]
    if (path) {
      await adminClient.storage.from('documents').remove([path])
    }
  }

  await adminClient.from('documents').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
