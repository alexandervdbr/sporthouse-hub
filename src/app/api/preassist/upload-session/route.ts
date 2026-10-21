import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isDriveStorageConfigured, createResumableUploadSession, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { hasOpenSection, hasClientAccess } from '@/lib/auth-permissions'
import { isAllowedPreassistExt, ALLOWED_PREASSIST_HINT, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-policy'
import { preassistFolderSegments, preassistUploadName, preassistRequiresClient } from '@/lib/preassist-upload'

// Opent een Drive-sessie en geeft de browser de sessie-URL, zodat die de
// bytes rechtstreeks naar Google stuurt. Deze route raakt nooit bestandsinhoud
// aan — alleen het kleine werk eromheen: map opzoeken, sessie starten.
//
// Dat is het hele punt. De oude /api/preassist/upload nam het bestand zelf
// aan, en Vercel weigert elk request body boven 4,5 MB voordat onze code
// draait. De UI beloofde 500 MB; in de praktijk kwam er geen video aan.
// Zelfde opzet als /api/files/upload-session, waar dit al zo werkt.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!hasOpenSection(user, 'preassist_toevoegen')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  if (!isDriveStorageConfigured()) {
    return NextResponse.json({ error: 'Google Drive is niet geconfigureerd.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const editionId = body?.editionId as string | undefined
  const section   = body?.section as string | undefined
  const clientId  = body?.clientId as string | undefined
  // "Staat er niet bij": een naam zonder id. Die gaat niet de clients-tabel
  // in — daar hangen bestanden, kalenders en klantentoegang aan — maar blijft
  // tekst bij de inzending, zodat een admin hem later echt kan aanmaken.
  const proposedClient = (body?.clientName as string | null | undefined)?.trim() || null
  // Waar deze upload onder hangt: bij Content het project, bij Inspiratie
  // het onderwerp. Eén veld, want het is één begrip.
  const title     = (body?.title as string | null | undefined)?.trim() || null
  const filename  = body?.filename as string | undefined
  const mimeType  = (body?.mimeType as string | undefined) || 'application/octet-stream'
  const fileSize  = body?.fileSize as number | undefined

  if (!editionId || !section || !filename || typeof fileSize !== 'number' || fileSize <= 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (section !== 'content' && section !== 'inspiratie') {
    return NextResponse.json({ error: 'Ongeldige sectie.' }, { status: 400 })
  }
  // Inspiratie hoort niet bij een klant; content wel.
  if (preassistRequiresClient(section) && !clientId && !proposedClient) {
    return NextResponse.json({ error: 'Kies een klant.' }, { status: 400 })
  }
  if (!isAllowedPreassistExt(filename)) {
    return NextResponse.json({ error: `Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_PREASSIST_HINT}.` }, { status: 400 })
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Bestand mag niet groter zijn dan ${MAX_UPLOAD_LABEL}.` }, { status: 400 })
  }
  // Stond nergens: een medewerker met een beperkte klantenlijst kon een
  // inzending onder een willekeurige andere klant hangen. /api/files/upload-
  // session controleert dit al; de dropdown is bovendien RLS-gefilterd, dus
  // dit sluit alleen het gat op API-niveau.
  if (clientId && !hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: edition } = await admin
    .from('preassist_editions')
    .select('title')
    .eq('id', editionId)
    .single()
  if (!edition) return NextResponse.json({ error: 'Editie niet gevonden.' }, { status: 404 })

  let clientName: string | null = proposedClient ? proposedClient.slice(0, 120) : null
  if (clientId) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })
    clientName = client.name
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Onbekend'

  try {
    const folderId = await getOrCreateFolderPath(
      preassistFolderSegments(edition.title, section, clientName, title),
      driveRootFolderId()!
    )
    const uploadUrl = await createResumableUploadSession(
      preassistUploadName(userName, filename), mimeType, folderId, fileSize
    )
    return NextResponse.json({ uploadUrl })
  } catch (err) {
    console.error('Pré-assist upload-sessie starten mislukt:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Kon upload niet starten: ${msg}` }, { status: 500 })
  }
}
