import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { restoreFile } from '@/lib/drive-storage'
import { canManageSection, type SporthouseSection } from '@/lib/sporthouse-docs'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Document ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('sporthouse_documents')
    .select('section, storage_provider, drive_file_id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document niet gevonden in de prullenbak.' }, { status: 404 })
  if (!canManageSection(user, doc.section as SporthouseSection)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (doc.storage_provider === 'drive' && doc.drive_file_id) {
    try {
      await restoreFile(doc.drive_file_id)
    } catch (err) {
      console.error('Drive restore error:', err)
      return NextResponse.json(
        { error: 'Kon document niet terugzetten in Drive — mogelijk al definitief verwijderd door Google (na 30 dagen).' },
        { status: 500 }
      )
    }
  }

  const { error } = await admin
    .from('sporthouse_documents')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
