import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { trashFile } from '@/lib/drive-storage'
import { hasOpenSection } from '@/lib/auth-permissions'

export const maxDuration = 300

// Hoeveel inzendingen er aan elke editie hangen, zodat de bevestiging kan
// zeggen wat er meegaat in plaats van een naakte "Zeker?".
//
// Per editie een count-query zonder rijen op te halen: bounded door het aantal
// edities (een handvol), en het haalt geen enkele rij over de lijn.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasOpenSection(user, 'preassist')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: editions, error } = await admin
    .from('preassist_editions')
    .select('id')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = await Promise.all(
    (editions ?? []).map(async e => {
      const { count } = await admin
        .from('preassist_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('edition_id', e.id)
      return [e.id, count ?? 0] as const
    })
  )

  return NextResponse.json(Object.fromEntries(counts))
}

// Een editie verwijderen, inclusief wat eraan hangt.
//
// Dit kon alleen vanuit de browser, en liep altijd stil vast op de foreign key
// van preassist_submissions. Nu met cascade (migratie 0057) zouden de rijen
// wel weggaan — maar dan blijven de bestanden als wezen in Drive achter, want
// daar heeft de browser geen credentials voor. Vandaar deze route: eerst de
// bestanden in Drive's prullenbak, dan de editie.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasOpenSection(user, 'preassist_beheer')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: edition } = await admin
    .from('preassist_editions')
    .select('id')
    .eq('id', id)
    .single()
  if (!edition) return NextResponse.json({ error: 'Editie niet gevonden.' }, { status: 404 })

  const { data: submissions } = await admin
    .from('preassist_submissions')
    .select('drive_file_id')
    .eq('edition_id', id)

  // Best effort, en bewust vóór de rijen: lukt het verwijderen van de editie
  // hierna niet, dan staan de bestanden in de prullenbak maar is er niets
  // kwijt — Drive houdt die dertig dagen vast. Andersom zou een mislukte
  // trash een bestand achterlaten waar geen rij meer naar wijst.
  let failedTrash = 0
  for (const s of submissions ?? []) {
    if (!s.drive_file_id) continue
    try { await trashFile(s.drive_file_id) } catch { failedTrash++ }
  }

  const { error } = await admin.from('preassist_editions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    deletedSubmissions: submissions?.length ?? 0,
    warning: failedTrash > 0
      ? `${failedTrash} bestand${failedTrash !== 1 ? 'en' : ''} kon niet in de prullenbak van Drive gezet worden en staat er nog.`
      : null,
  })
}
