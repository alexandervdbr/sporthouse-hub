import { timingSafeEqual } from 'crypto'
import { todayInBrussels } from '@/lib/gear/dates'
import { mailConfig } from '@/lib/gear/mail'
import { sendDueReminders } from '@/lib/gear/mail-server'

// POST — de herinneringen van vandaag versturen. Aangeroepen door de
// dagelijkse trigger in het Apps Script-project (scripts/apps-script/
// materiaal-mail), met het gedeelde geheim als Bearer-token; geen login.
// De hub stuurt de mails zelf via hetzelfde script als de bevestigingen,
// zodat er één manier van versturen en één logboek is: twee keer aanroepen
// verstuurt niets twee keer.

function validSecret(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const config = mailConfig()
  if (!config) return new Response('De mail is niet ingesteld.', { status: 503 })
  if (!validSecret(req.headers.get('authorization'), config.secret)) return new Response('Niet toegestaan', { status: 401 })
  try {
    return Response.json({ ok: true, date: todayInBrussels(), ...(await sendDueReminders(todayInBrussels())) })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Mislukt' }, { status: 500 })
  }
}
