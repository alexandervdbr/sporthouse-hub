import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFileMetadata, trashFile, getResumableUploadResult, getOrCreateFolderPath, driveRootFolderId } from '@/lib/drive-storage'
import { hasOpenSection, hasClientAccess } from '@/lib/auth-permissions'
import { isAllowedPreassistExt, ALLOWED_PREASSIST_HINT } from '@/lib/upload-policy'
import { preassistFolderSegments, preassistRequiresClient } from '@/lib/preassist-upload'

// Aangeroepen zodra de browser de bytes rechtstreeks naar de sessie-URL van
// /api/preassist/upload-session heeft gestuurd. Schrijft alleen de rij in
// Supabase, met bestandsgegevens die wij zelf bij Drive ophalen — niet wat de
// client beweert. Zelfde opzet als /api/files/finalize.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!hasOpenSection(user, 'preassist_toevoegen')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const editionId  = body?.editionId as string | undefined
  const section    = body?.section as string | undefined
  const clientId   = body?.clientId as string | undefined
  // "Staat er niet bij": een naam zonder id. Die gaat niet de clients-tabel
  // in — daar hangen bestanden, kalenders en klantentoegang aan — maar blijft
  // tekst bij de inzending, zodat een admin hem later echt kan aanmaken.
  const proposedClient = (body?.clientName as string | null | undefined)?.trim() || null
  // Waar deze inzending onder hangt: bij Content het project, bij Inspiratie
  // het onderwerp. Eén veld, want het is één begrip.
  const titleInput = (body?.title as string | null | undefined)?.trim() || null
  // Wat de inzender erover zegt.
  const noteInput  = (body?.note as string | null | undefined)?.trim() || null

  const title = titleInput ? titleInput.slice(0, 200) : null
  const note  = noteInput ? noteInput.slice(0, 1000) : null
  const uploadUrl  = body?.uploadUrl as string | undefined
  const fileName   = body?.fileName as string | undefined
  const fileSize   = Number(body?.fileSize)

  if (!editionId || !section || !uploadUrl || !fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (section !== 'content' && section !== 'inspiratie') {
    return NextResponse.json({ error: 'Ongeldige sectie.' }, { status: 400 })
  }
  // Inspiratie hoort niet bij een klant; content wel. Dezelfde vraag als in
  // upload-session, via dezelfde functie.
  if (preassistRequiresClient(section) && !clientId && !proposedClient) {
    return NextResponse.json({ error: 'Kies een klant.' }, { status: 400 })
  }
  // De sessie-URL komt van de browser terug, dus wordt hij gecontroleerd zoals
  // files/finalize dat doet: hier wordt naar niets anders dan een Drive-
  // uploadsessie geschreven.
  if (!uploadUrl.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
    return NextResponse.json({ error: 'Ongeldige upload-URL.' }, { status: 400 })
  }
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

  // De browser stuurt de bytes naar Google, en het antwoord op zijn laatste
  // blok komt zonder CORS-headers aan — hij ziet de upload wel landen, maar
  // niet wat het geworden is. Het hier navragen levert zowel het antwoord op
  // als een id dat we niet van de client hoeven aan te nemen.
  let driveFileId: string
  try {
    const result = await getResumableUploadResult(uploadUrl, fileSize)
    if (!result.done) {
      return NextResponse.json(
        { error: 'Upload is nog niet volledig aangekomen.', receivedBytes: result.receivedBytes },
        { status: 409 }
      )
    }
    driveFileId = result.fileId
  } catch (err) {
    console.error('Pré-assist uploadsessie afronden mislukt:', err)
    return NextResponse.json({ error: 'Kon de upload niet afronden.' }, { status: 502 })
  }

  let driveFile
  try {
    driveFile = await getFileMetadata(driveFileId)
  } catch (err) {
    console.error('Kon geüpload Pré-assist-bestand niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon geüpload bestand niet verifiëren.' }, { status: 500 })
  }

  // Controleren dat het bestand in de map staat die dit verzoek claimt. Het id
  // komt nu uit een sessie die we zelf openden, maar editie, sectie en klant
  // in de body blijven de keuze van de aanroeper — zonder dit kan er een rij
  // komen te staan die naar een bestand van een andere klant wijst.
  try {
    const expectedParent = await getOrCreateFolderPath(
      preassistFolderSegments(edition.title, section, clientName, title),
      driveRootFolderId()!
    )
    if (!driveFile.parents?.includes(expectedParent)) {
      return NextResponse.json({ error: 'Upload hoort niet bij deze editie of klant.' }, { status: 400 })
    }
  } catch (err) {
    console.error('Kon Pré-assist-doelmap niet verifiëren:', err)
    return NextResponse.json({ error: 'Kon de doelmap niet verifiëren.' }, { status: 500 })
  }

  if (!isAllowedPreassistExt(driveFile.name)) {
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json({ error: `Dit bestandstype wordt niet ondersteund. Toegestaan: ${ALLOWED_PREASSIST_HINT}.` }, { status: 400 })
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Onbekend'
  // title is waar de inzending onder hangt: bij Content het project, bij
  // Inspiratie het onderwerp. note is wat de inzender erover zegt.

  const { data: record, error: dbError } = await admin
    .from('preassist_submissions')
    .insert({
      edition_id: editionId,
      section,
      title,
      note,
      // De originele bestandsnaam, zonder de inzender ervoor — die staat in
      // submitted_by_name, en de zip zet hem er zelf weer voor.
      file_name: fileName,
      file_type: driveFile.mimeType,
      file_size: driveFile.size ? Number(driveFile.size) : fileSize,
      submitted_by_id: user.id,
      submitted_by_name: userName,
      client_id: clientId ?? null,
      // Bij een voorgestelde klant staat hier wel een naam en geen id.
      // De pagina groepeert op de naam, dus dat werkt zoals het hoort.
      client_name: clientName,
      storage_provider: 'drive',
      drive_file_id: driveFile.id,
      web_view_link: driveFile.webViewLink,
      web_content_link: driveFile.webContentLink,
      thumbnail_link: driveFile.thumbnailLink,
    })
    .select()
    .single()

  if (dbError) {
    console.error('Pré-assist DB insert error:', dbError)
    try { await trashFile(driveFile.id) } catch { /* best effort cleanup */ }
    return NextResponse.json({ error: `Fout bij opslaan: ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json(record, { status: 201 })
}
