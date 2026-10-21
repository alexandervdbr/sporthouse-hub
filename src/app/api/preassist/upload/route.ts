import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { trashFile } from '@/lib/drive-storage'
import { hasOpenSection } from '@/lib/auth-permissions'

// Alleen nog verwijderen. De POST die hier stond nam het hele bestand in één
// request aan, wat Vercel boven 4,5 MB weigert voordat onze code draait — zie
// upload-session en finalize ernaast, die de bytes rechtstreeks naar Google
// laten gaan.
//
// De route houdt zijn naam omdat de client hier al naar DELETE'te; alleen de
// POST is weg.
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

  if (!hasOpenSection(user, 'preassist_verwijderen') && submission.submitted_by_id !== user.id) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (submission.drive_file_id) {
    try { await trashFile(submission.drive_file_id) } catch { /* may already be gone */ }
  }

  const { error } = await admin.from('preassist_submissions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
