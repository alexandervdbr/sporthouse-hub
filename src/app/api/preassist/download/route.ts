import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/drive-storage'
import { hasSection } from '@/lib/auth-permissions'

export const maxDuration = 60

// Streams a Drive-stored submission through our own service account instead
// of relying on Google's public webContentLink — avoids the "can't scan for
// viruses" interstitial Google shows for larger files on that link.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasSection(user, 'preassist')) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('preassist_submissions')
    .select('drive_file_id, file_name, file_type')
    .eq('id', id)
    .single()

  if (!submission?.drive_file_id) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }

  try {
    const stream = await downloadFile(submission.drive_file_id)
    const webStream = Readable.toWeb(stream as Readable) as ReadableStream
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': submission.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(submission.file_name)}"`,
      },
    })
  } catch (err) {
    console.error('Pré-assist Drive download error:', err)
    return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
  }
}
