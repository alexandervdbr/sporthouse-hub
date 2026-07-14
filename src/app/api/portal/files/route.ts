import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/drive-storage'

export const maxDuration = 60

// Streams a freelancer's own assignment file — Drive-stored files go through
// our own service account (same pattern as /api/files/download); older,
// still-Supabase-stored rows fall back to a signed URL redirect.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get('id')
  if (!fileId) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) return NextResponse.json({ error: 'Geen freelancer-account.' }, { status: 403 })

  const { data: file } = await admin
    .from('freelancer_assignment_files')
    .select('file_name, file_url, storage_provider, drive_file_id, freelancer_assignments!inner(freelancer_id)')
    .eq('id', fileId)
    .eq('freelancer_assignments.freelancer_id', freelancer.id)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })

  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try {
      const stream = await downloadFile(file.drive_file_id)
      const webStream = Readable.toWeb(stream as Readable) as ReadableStream
      return new NextResponse(webStream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.file_name)}"`,
        },
      })
    } catch (err) {
      console.error('Drive download error:', err)
      return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
    }
  }

  if (!file.file_url) return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  const { data: signed } = await admin.storage.from('freelancer-assignments').createSignedUrl(file.file_url, 3600)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Kon URL niet genereren.' }, { status: 500 })
  return NextResponse.redirect(signed.signedUrl)
}
