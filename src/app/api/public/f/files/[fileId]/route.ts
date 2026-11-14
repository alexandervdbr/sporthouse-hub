import { after } from 'next/server'
import { isUuid } from '@/features/freelancers/lib/server'
import { json, notFound, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { loadVisible } from '@/features/freelancers/lib/public-select'
import { downloadUrl, revokeExpiredShares, FILE_DOWNLOAD_COLUMNS, type FileRow } from '@/features/freelancers/lib/files-server'

// GET — een bijlage downloaden. Pas NA de controle van link, pincode (cookie)
// en eigenaarschap (het bestand hoort bij een zichtbare opdracht van deze
// freelancer) wordt het bestand tijdelijk gedeeld; daarna een redirect naar
// Drive. Geen byte loopt door deze function. Na een uur ingetrokken.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const auth = await requireLinkSession(req, 'read')
  if ('error' in auth) return auth.error
  const { fileId } = await params
  if (!isUuid(fileId)) return notFound()

  const { data } = await auth.db.from('freelancer_assignment_files')
    .select(`${FILE_DOWNLOAD_COLUMNS}, assignment_id`).eq('id', fileId).maybeSingle()
  const file = data as (FileRow & { assignment_id: string }) | null
  if (!file) return notFound()
  if (!(await loadVisible(auth.db, auth.link.freelancer_id, file.assignment_id))) return notFound()

  after(() => revokeExpiredShares(auth.db).catch(() => {}))
  try {
    // Altijd de tijdelijke deling: een freelancer heeft geen toegang tot onze Drive.
    const url = await downloadUrl(auth.db, file, 'tijdelijke-deling')
    if (!url) return notFound()
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } })
  } catch {
    return json({ error: 'Kon het bestand niet klaarzetten. Probeer opnieuw.' }, 502)
  }
}
