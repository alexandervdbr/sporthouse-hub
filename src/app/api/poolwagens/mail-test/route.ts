import { requirePoolwagens } from '@/lib/poolwagens/server'
import { mailConfig, trySendMail } from '@/lib/poolwagens/mail'

// POST — één testmail naar jezelf (het adres van je eigen account), om de
// mail-worker (Apps Script) te controleren. Alleen beheer. Verstuurt niets naar anderen.
export async function POST() {
  const auth = await requirePoolwagens('manage')
  if ('error' in auth) return auth.error
  const { user } = auth

  if (!user.email) return new Response('Je account heeft geen e-mailadres.', { status: 400 })
  const config = mailConfig()
  if (!config) return Response.json({ status: 'niet_geconfigureerd', error: null })

  const outcome = await trySendMail([user.email], {
    subject: 'Testmail van Poolwagens',
    text: `Dit is een testmail van de module Poolwagens in de Sporthouse Hub.\n\nKomt deze aan, dan werkt de mail-worker.`,
    html: `<p>Dit is een testmail van de module Poolwagens in de Sporthouse Hub.</p><p>Komt deze aan, dan werkt de mail-worker.</p>`,
  }, config)
  return Response.json({ ...outcome, to: user.email })
}
