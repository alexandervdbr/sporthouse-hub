import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isDriveStorageConfigured, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { hasOpenSection } from '@/lib/auth-permissions'
import { preassistEditionFolderSegments, driveFolderUrl } from '@/lib/preassist-upload'

// Waar een editie in Drive staat.
//
// Hiermee haalt iemand een hele editie op zonder dat er een byte langs ons
// gaat: Google pakt de map zelf in en levert hem uit. Dat scheelt het verschil
// tussen "negen gigabyte door onze functies" en nul — en er is geen zip in het
// geheugen van een tabblad meer voor nodig, dus ook geen plafond van 500 MB.
//
// De map-id wordt onthouden na de eerste keer; daarna is dit een rij uit de
// database en geen gesprek met Drive.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasOpenSection(user, 'preassist_downloaden')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: edition } = await admin
    .from('preassist_editions')
    .select('title, drive_folder_id')
    .eq('id', id)
    .single()

  if (!edition) return NextResponse.json({ error: 'Editie niet gevonden.' }, { status: 404 })
  if (edition.drive_folder_id) {
    return NextResponse.json({ url: driveFolderUrl(edition.drive_folder_id) })
  }

  if (!isDriveStorageConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  try {
    // Maakt de map aan als er nog niets is ingestuurd. Een lege map is een
    // eerlijker antwoord dan een foutmelding: de editie bestaat, er staat
    // alleen nog niets in.
    const folderId = await getOrCreateFolderPath(
      preassistEditionFolderSegments(edition.title),
      driveRootFolderId()!
    )
    await admin.from('preassist_editions').update({ drive_folder_id: folderId }).eq('id', id)
    return NextResponse.json({ url: driveFolderUrl(folderId) })
  } catch (err) {
    console.error('Kon Pré-assist-editiemap niet vinden:', err)
    return NextResponse.json({ error: 'Kon de map in Drive niet openen.' }, { status: 500 })
  }
}
