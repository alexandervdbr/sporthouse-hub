import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/drive-storage'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'
import { inlineMimeType } from '@/lib/upload-policy'

export const maxDuration = 300

// Streams the bytes through our own service account. Unlike client files this
// isn't just to dodge Google's virus-scan interstitial — these documents are
// never shared publicly in Drive, so this route is the only way to reach them,
// and it re-checks the section permission on every single read.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, filename, file_type, storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canViewSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  // See the twin under /api/files: `inline=1` lets the viewer play media in
  // place, and is honoured only for audio and video so an upload can never be
  // rendered as markup in our origin.
  const inlineType = new URL(request.url).searchParams.get('inline') === '1'
    ? inlineMimeType(doc.file_type ?? '')
    : null

  if (doc.storage_provider === 'drive' && doc.drive_file_id) {
    try {
      const stream = await downloadFile(doc.drive_file_id)
      const webStream = Readable.toWeb(stream as Readable) as ReadableStream
      return new NextResponse(webStream, {
        headers: {
          'Content-Type': inlineType ?? 'application/octet-stream',
          'Content-Disposition': inlineType
            ? 'inline'
            : `attachment; filename="${encodeURIComponent(doc.filename)}"`,
          'Accept-Ranges': 'bytes',
        },
      })
    } catch (err) {
      console.error('Drive download error:', err)
      return NextResponse.json({ error: 'Kon document niet downloaden.' }, { status: 500 })
    }
  }

  // Legacy rows still on Supabase Storage
  if (!doc.storage_path) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  const { data: signed } = await admin.storage
    .from('sporthouse-internal')
    .createSignedUrl(doc.storage_path, 120, { download: doc.filename })

  if (!signed) return NextResponse.json({ error: 'Kon download niet aanmaken.' }, { status: 500 })
  return NextResponse.redirect(signed.signedUrl)
}
