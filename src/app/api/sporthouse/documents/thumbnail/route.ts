import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchThumbnail } from '@/lib/drive-storage'
import { canViewSection, type SporthouseSection } from '@/lib/sporthouse-docs'

export const maxDuration = 60

// Drive's rendered preview image for an internal document — see the twin
// route under /api/files for why this is proxied instead of linked. Like the
// download route beside it, the section permission is re-checked on every
// read, since these documents are never shared publicly in Drive.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, drive_file_id')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 })
  if (!canViewSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }
  if (doc.storage_provider !== 'drive' || !doc.drive_file_id) {
    return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
  }

  try {
    const thumb = await fetchThumbnail(doc.drive_file_id)
    if (!thumb) {
      return NextResponse.json({ error: 'Geen voorbeeld beschikbaar.' }, { status: 404 })
    }
    return new NextResponse(thumb.body, {
      headers: {
        'Content-Type': thumb.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Kon thumbnail niet ophalen:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Kon voorbeeld niet ophalen.' }, { status: 500 })
  }
}
