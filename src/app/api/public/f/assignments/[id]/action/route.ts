import { isUuid } from '@/features/freelancers/lib/server'
import { json, notFound, requireLinkSession } from '@/features/freelancers/lib/public-server'
import { actionSchema, readBody } from '@/features/freelancers/lib/public-schemas'
import { detailFor, loadVisible } from '@/features/freelancers/lib/public-select'
import { applyTransition } from '@/features/freelancers/lib/assignments-server'
import { notifyCreator } from '@/features/freelancers/lib/notify'

// POST {action, reason?} — accepteren, weigeren (reden optioneel) of
// opleveren. Via dezelfde overgangsfunctie als het team; alleen wat de
// freelancer mag (src/features/freelancers/lib/statuses.ts) gaat door.
const TO = { accepteren: 'geaccepteerd', weigeren: 'geweigerd', opleveren: 'opgeleverd' } as const
const PUSH = { accepteren: 'heeft de opdracht geaccepteerd', weigeren: 'heeft de opdracht geweigerd', opleveren: 'heeft opgeleverd' } as const

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLinkSession(req, 'write')
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!isUuid(id)) return notFound()
  const body = await readBody(req, actionSchema)
  if (!body) return json({ error: 'Ongeldig verzoek.' }, 400)

  const row = await loadVisible(auth.db, auth.link.freelancer_id, id)
  if (!row) return notFound()

  const r = await applyTransition(auth.db, {
    assignmentId: id, to: TO[body.action], actor: 'freelancer', actorId: null,
    message: body.action === 'weigeren' ? body.reason ?? null : null,
    freelancerId: auth.link.freelancer_id,
  })
  if (!r.ok) return json({ error: r.status === 409 ? 'Dit kan niet (meer) bij deze opdracht. Vernieuw de pagina.' : r.error }, r.status === 404 ? 404 : r.status)

  const { data: f } = await auth.db.from('freelancers').select('name').eq('id', auth.link.freelancer_id).maybeSingle()
  await notifyCreator(row.created_by, `${f?.name ?? 'Een freelancer'} ${PUSH[body.action]}`, row.title, id)

  const updated = await loadVisible(auth.db, auth.link.freelancer_id, id)
  return json(updated ? await detailFor(auth.db, updated) : { id, status: TO[body.action] })
}
