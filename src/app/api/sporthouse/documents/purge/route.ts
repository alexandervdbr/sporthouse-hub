import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/drive-storage'
import { canManageSection, type SporthouseSection } from '@/lib/sporthouse-docs'

// Permanently removes a document from the Prullenbak, ahead of the 30-day cron.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, storage_path, drive_file_id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden in de prullenbak.' }, { status: 404 })
  if (!canManageSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  // The document is already in Drive's own bin from the soft-delete, so even
  // when this hard delete is refused (the service account is Content manager,
  // not Manager) Google still clears it at the 30-day mark.
  if (doc.storage_provider === 'drive' && doc.drive_file_id) {
    try { await deleteFile(doc.drive_file_id) } catch (err) { console.error('Drive purge error:', err) }
  } else if (doc.storage_path) {
    await admin.storage.from('sporthouse-internal').remove([doc.storage_path])
  }

  const { error } = await admin.from('sporthouse_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
