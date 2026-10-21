import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasOpenSection, hasClientAccess } from '@/lib/auth-permissions'
import { normalizeSubmittedUrl, fetchLinkMetadata, hostnameOf } from '@/lib/preassist-links'
import { hostThumbnailOnDrive } from '@/lib/reel-thumbnail-storage'
import { preassistRequiresClient } from '@/lib/preassist-upload'

export const maxDuration = 60

const PREASSIST_THUMBNAIL_FOLDER = 'Pré-Assist — thumbnails'

// Een of meer geplakte links als inzending opslaan.
//
// De rijen worden meteen weggeschreven en het antwoord gaat terug; titel,
// auteur en thumbnail komen daarna. Dat is bewust: metadata ophalen bij
// Instagram duurt seconden en kan mislukken, en niemand hoort daarop te
// wachten met een geplakte link in beeld. Zelfde opzet als /api/save-reel,
// waar dit al zo werkt.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (!hasOpenSection(user, 'preassist_toevoegen')) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const editionId = body?.editionId as string | undefined
  const section   = body?.section as string | undefined
  const clientId  = (body?.clientId as string | null | undefined) ?? null
  const note      = (body?.note as string | null | undefined) ?? null
  const rawUrls   = body?.urls

  if (!editionId || !section || !Array.isArray(rawUrls) || rawUrls.length === 0) {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }
  if (section !== 'content' && section !== 'inspiratie') {
    return NextResponse.json({ error: 'Ongeldige sectie.' }, { status: 400 })
  }
  if (preassistRequiresClient(section) && !clientId) {
    return NextResponse.json({ error: 'Kies een klant.' }, { status: 400 })
  }
  if (clientId && !hasClientAccess(user, clientId)) {
    return NextResponse.json({ error: 'Geen toegang tot deze klant.' }, { status: 403 })
  }
  // Niet op het woord van de browser: dezelfde normalisatie als daar, want
  // hierop staat de unieke index die dubbele inzendingen tegenhoudt.
  const urls = (rawUrls as unknown[])
    .filter((u): u is string => typeof u === 'string')
    .map(normalizeSubmittedUrl)
    .filter((u): u is string => !!u)
    .slice(0, 25)

  if (!urls.length) {
    return NextResponse.json({ error: 'Geen geldige link gevonden.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: edition } = await admin
    .from('preassist_editions')
    .select('id')
    .eq('id', editionId)
    .single()
  if (!edition) return NextResponse.json({ error: 'Editie niet gevonden.' }, { status: 404 })

  let clientName: string | null = null
  if (clientId) {
    const { data: client } = await admin.from('clients').select('name').eq('id', clientId).single()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden.' }, { status: 404 })
    clientName = client.name
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Onbekend'
  const title = typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null

  // Dezelfde link twee keer in dezelfde editie is geen tweede kaartje — dat
  // bewaakt de unieke index uit 0059. ignoreDuplicates laat de insert dan
  // gewoon slagen met minder rijen, in plaats van het hele verzoek te laten
  // mislukken omdat er één dubbel tussen zat.
  const { data: inserted, error } = await admin
    .from('preassist_submissions')
    .upsert(
      urls.map(url => ({
        edition_id: editionId,
        section,
        kind: 'link',
        url,
        title,
        link_status: 'pending',
        link_author: hostnameOf(url),
        submitted_by_id: user.id,
        submitted_by_name: userName,
        client_id: clientId,
        client_name: clientName,
        storage_provider: 'drive',
      })),
      { onConflict: 'edition_id,url', ignoreDuplicates: true }
    )
    .select('id, url')

  if (error) {
    console.error('Pré-assist link insert error:', error)
    return NextResponse.json({ error: `Fout bij opslaan: ${error.message}` }, { status: 500 })
  }

  const rows = inserted ?? []

  // Na het antwoord: ophalen wat er van de link te maken valt. Mislukt dat,
  // dan blijft het kaartje bestaan met alleen de url — dat is bruikbaar, en
  // een inzending weggooien omdat Instagram even niet meewerkte niet.
  after(async () => {
    for (const row of rows) {
      try {
        const meta = await fetchLinkMetadata(row.url)
        const hosted = meta.thumbnailUrl
          ? await hostThumbnailOnDrive(meta.thumbnailUrl, row.id, PREASSIST_THUMBNAIL_FOLDER)
          : null

        await admin
          .from('preassist_submissions')
          .update({
            link_status: 'done',
            link_author: meta.author ?? hostnameOf(row.url),
            link_caption: meta.caption,
            thumbnail_drive_id: hosted?.driveId ?? null,
          })
          .eq('id', row.id)
      } catch (err) {
        console.error('Pré-assist linkmetadata mislukt:', err instanceof Error ? err.message : err)
        await admin.from('preassist_submissions').update({ link_status: 'done' }).eq('id', row.id)
      }
    }
  })

  return NextResponse.json({ added: rows.length, skipped: urls.length - rows.length }, { status: 201 })
}
