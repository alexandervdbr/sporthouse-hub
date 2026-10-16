import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { downloadFileWithMeta, downloadFileRange } from '@/lib/drive-storage'
import { hasOpenSection, isFreelancerUser } from '@/lib/auth-permissions'
import { getSessionUser } from '@/lib/supabase/claims'

// Zie de toelichting bij /api/files/download: 300 is wat deze plan toelaat,
// en het weegt minder zwaar sinds een afgebroken download hervat kan worden.
export const maxDuration = 300

// Streams a Drive-stored submission through our own service account instead
// of relying on Google's public webContentLink — avoids the "can't scan for
// viruses" interstitial Google shows for larger files on that link.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  // Leespad: het token wordt lokaal nagerekend in plaats van bij de
  // Auth-server bevestigd — zie lib/supabase/claims. Bij een zip van vijftig
  // bestanden was dat anders vijftig keer wachten op Supabase.
  const user = await getSessionUser(supabase)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  // Deze route staat met opzet niet in de matcher van de proxy, zodat een
  // gestreamd bestand niet twee keer op de transferrekening komt. De proxy is
  // ook wat freelancer-accounts in één keer uit alle medewerkersroutes houdt
  // — dus moet die controle hier staan, waar hij anders zou ontbreken. Niet
  // weghalen zonder de route terug achter de proxy te zetten.
  if (isFreelancerUser(user)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }
  if (!hasOpenSection(user, 'preassist')) return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID ontbreekt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: submission } = await admin
    .from('preassist_submissions')
    .select('drive_file_id, file_name')
    .eq('id', id)
    .single()

  if (!submission?.drive_file_id) {
    return NextResponse.json({ error: 'Bestand niet gevonden.' }, { status: 404 })
  }

  // Altijd als download, nooit inline: een inzending inline uitleveren laat de
  // browser hem in ons eigen origin renderen, en dat is bij beeldformaten een
  // uitvoeringsgat. Wie een video wil bekijken krijgt Drive's eigen preview,
  // die ook niet door onze servers stroomt.
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(submission.file_name)}"`,
    'X-Content-Type-Options': 'nosniff',
    // Hiermee leert een browser of downloadmanager dat hij om stukken mag
    // vragen. Dat is hier meer dan netheid: dit streamt door een function met
    // een harde tijdslimiet, dus een groot bestand op een trage verbinding
    // haalt het niet in één keer. Begrensde stukken passen elk wel, en een
    // weggevallen verbinding hervat in plaats van opnieuw te beginnen.
    'Accept-Ranges': 'bytes',
  }

  const range = request.headers.get('range')

  try {
    if (range) {
      const part = await downloadFileRange(submission.drive_file_id, range)
      const webStream = Readable.toWeb(part.stream as Readable) as ReadableStream
      if (part.contentRange) headers['Content-Range'] = part.contentRange
      if (part.contentLength) headers['Content-Length'] = part.contentLength
      return new NextResponse(webStream, { status: part.partial ? 206 : 200, headers })
    }

    const full = await downloadFileWithMeta(submission.drive_file_id)
    const webStream = Readable.toWeb(full.stream as Readable) as ReadableStream
    // Van Drive, niet van onze eigen file_size-kolom, zodat het niet kan
    // afwijken van de bytes die er daadwerkelijk uitgaan.
    if (full.contentLength) headers['Content-Length'] = full.contentLength
    return new NextResponse(webStream, { headers })
  } catch (err) {
    console.error('Pré-assist Drive download error:', err)
    return NextResponse.json({ error: 'Kon bestand niet downloaden.' }, { status: 500 })
  }
}
