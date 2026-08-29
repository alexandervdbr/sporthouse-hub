import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { restoreFile } from '@/lib/drive-storage'
import { hasClientAccess, isAdminUser } from '@/lib/auth-permissions'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function canDeleteFiles(user: { email?: string | null; app_metadata?: Record<string, unknown> }) {
  const permsObj = (user.app_metadata?.permissions as { sections?: string[] } | null) ?? null
  const sections = permsObj?.sections ?? []
  const isAdmin = isAdminUser(user)
  return isAdmin || permsObj === null || sections.includes('bestanden_verwijderen')
}

function canManageFile(user: { email?: string | null; app_metadata?: Record<string, unknown> }, uploadedBy: string | null) {
  return canDeleteFiles(user) || (uploadedBy !== null && uploadedBy === user.email)
}

export async function POST(request: NextRequest) {
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
    .not('deleted_at', 'is', null)
    .single()

  if (!file) return NextResponse.json({ error: 'Bestand niet gevonden in de prullenbak.' }, { status: 404 })
  if (!hasClientAccess(user, file.client_id)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  if (!canManageFile(user, file.uploaded_by)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (file.storage_provider === 'drive' && file.drive_file_id) {
    try {
      await restoreFile(file.drive_file_id)
    } catch (err) {
      console.error('Drive restore error:', err)
      return NextResponse.json({ error: 'Kon bestand niet terugzetten in Drive — mogelijk al definitief verwijderd door Google (na 30 dagen).' }, { status: 500 })
    }
  }

  const { error } = await admin
    .from('files')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
