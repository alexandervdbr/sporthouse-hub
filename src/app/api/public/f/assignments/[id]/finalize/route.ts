import { isUuid } from '@/features/freelancers/lib/server'
import { json, limit, notFound, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { publicFinalizeSchema, readBody } from '@/features/freelancers/lib/public-schemas'
import { loadVisible } from '@/features/freelancers/lib/public-select'
import { finalizeUploads } from '@/features/freelancers/lib/files-server'
import { recordEvent } from '@/features/freelancers/lib/assignments-server'

// POST {uploads} — na het opleveren van bestanden: bij Drive navragen wat er
// aankwam, controleren dat het in de map van deze opdracht staat, en het
// registreren als oplevering. Antwoord per bestand.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLinkSession(req, 'write')
  if ('error' in auth) return auth.error
  const perLink = await limit(auth.db, req, 'upload', auth.link.id)
  if (perLink) return perLink
  const { id } = await params
  if (!isUuid(id)) return notFound()
  const body = await readBody(req, publicFinalizeSchema)
  if (!body) return json({ error: 'Ongeldig verzoek.' }, 400)

  const row = await loadVisible(auth.db, auth.link.freelancer_id, id)
  if (!row) return notFound()
  if (row.status !== 'geaccepteerd' && row.status !== 'opgeleverd') return json({ error: 'Deze opdracht neemt geen bestanden meer aan.' }, 409)

  try {
    const results = await finalizeUploads(auth.db, { id, freelancer_id: auth.link.freelancer_id }, body.uploads,
      { uploader: 'freelancer', kind: 'oplevering', createdBy: null })
    const names = results.flatMap(r => (r.ok ? [r.name] : []))
    if (names.length) {
      await recordEvent(auth.db, { assignmentId: id, actorType: 'freelancer', kind: 'bestand', message: `Opgeleverd: ${names.join(', ')}` })
    }
    return json({ results })
  } catch {
    return json({ error: 'Kon de bestanden niet controleren. Probeer opnieuw.' }, 502)
  }
}
