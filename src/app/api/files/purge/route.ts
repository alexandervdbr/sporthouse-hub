import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { trashFile } from '@/lib/drive-storage'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAdminUser(user: { email?: string | null; app_metadata?: Record<string, unknown> }) {
  const permsObj = (user.app_metadata?.permissions as { sections?: string[] } | null) ?? null
  const sections = permsObj?.sections ?? []
  return ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
}

// Permanent, irreversible delete — only reachable from the Prullenbak view,
// and only for admins. Everyone else can trash/restore but not purge.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Enkel beheerders kunnen definitief verwijderen.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'File ID ontbreekt.' }, { status: 400 })

  const admin = adminClient()

  const { data: file } = await admin
    .from('files')
    .select('storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!file) return NextResponse.json({ error: 'Bestand niet gevonden in de prullenbak.' }, { status: 404 })

  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try { await trashFile(file.drive_file_id) } catch (err) { console.error('Drive purge error:', err) }
  } else if (file.storage_path) {
    const { error: storageError } = await admin.storage.from('files').remove([file.storage_path])
    if (storageError) console.error('Storage purge error:', storageError)
  }

  const { error } = await admin.from('files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
