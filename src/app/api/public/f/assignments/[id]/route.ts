import { isUuid } from '@/features/freelancers/lib/server'
import { json, notFound, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { detailFor, loadVisible } from '@/features/freelancers/lib/public-select'
import { recordEvent } from '@/features/freelancers/lib/assignments-server'

// GET — één opdracht van deze freelancer. Een opdracht van iemand anders,
// een concept of een geannuleerde opdracht: 404. De eerste keer zet dit
// first_viewed_at (de badge "Nieuw" verdwijnt) en schrijft een event.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLinkSession(req, 'read')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const row = await loadVisible(auth.db, auth.link.freelancer_id, id)
  if (!row) return notFound()

  if (!row.first_viewed_at) {
    const { data } = await auth.db.from('freelancer_assignments')
      .update({ first_viewed_at: new Date().toISOString() })
      .eq('id', id).is('first_viewed_at', null).select('id')
    if (data?.length) await recordEvent(auth.db, { assignmentId: id, actorType: 'freelancer', kind: 'bekeken' })
  }
  return json(await detailFor(auth.db, row))
}
