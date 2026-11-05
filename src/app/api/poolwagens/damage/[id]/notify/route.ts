import { createAdminClient } from '@/lib/supabase/server'
import { requirePoolwagens, dbErrorResponse } from '@/lib/poolwagens/server'
import { damageMail, trySendMail } from '@/lib/poolwagens/mail'
import { managerIds } from '@/lib/poolwagens/notify'
import { pushToUsers } from '@/lib/poolwagens/push'

// POST — de mail (en de push) bij een schademelding. De browser roept dit
// aan nadat de melding en de foto's opgeslagen zijn. Wie meldde, mag het één
// keer; beheer kan de mail opnieuw versturen (dan geen tweede push).
//
// Een mislukte of onmogelijke mail blokkeert niets: de melding staat al in de
// database, en de uitkomst komt als mailstatus bij de melding (die beheer in
// de schadelijst ziet).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePoolwagens('use')
  if ('error' in auth) return auth.error
  const { supabase, user, access } = auth
  const { id } = await params

  const { data: report, error } = await supabase
    .from('pool_car_damage_reports')
    .select('id, car_id, description, severity, reported_by, reported_by_name, mail_attempted_at, pool_cars(name, license_plate), pool_car_damage_photos(id)')
    .eq('id', id).single()
  if (error) return dbErrorResponse(error)

  const first = !report.mail_attempted_at
  if (!access.manage && (report.reported_by !== user.id || !first)) {
    return new Response('De mail voor deze melding is al verwerkt.', { status: 409 })
  }

  // De ontvangers leest alleen beheer; de server leest ze hier met de
  // service-sleutel, alleen lezend.
  const { data: settings } = await createAdminClient().from('pool_settings').select('damage_mail_recipients').maybeSingle()
  const recipients: string[] = settings?.damage_mail_recipients ?? []

  const car = (Array.isArray(report.pool_cars) ? report.pool_cars[0] : report.pool_cars) as { name: string; license_plate: string } | null
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || new URL(req.url).origin
  const outcome = await trySendMail(recipients, damageMail({
    carName: car?.name ?? 'Poolwagen',
    plate: car?.license_plate ?? '',
    severity: report.severity,
    description: report.description,
    reporter: report.reported_by_name,
    photoCount: report.pool_car_damage_photos?.length ?? 0,
    link: `${origin}/poolwagens/schade?melding=${report.id}`,
  }))

  const { error: statusError } = await supabase.rpc('pool_set_damage_mail_status', {
    p_id: report.id, p_status: outcome.status, p_error: outcome.error,
  })
  if (statusError) console.error('Poolwagens: mailstatus niet opgeslagen:', statusError.message)

  if (first) {
    await pushToUsers((await managerIds()).filter(uid => uid !== user.id), {
      title: `${report.severity === 'ernstig' ? 'Ernstige schade' : 'Schade'}: ${car?.name ?? 'poolwagen'}`,
      body: `${report.reported_by_name}: ${report.description.slice(0, 120)}`,
      url: `/poolwagens/schade?melding=${report.id}`,
    })
  }

  return Response.json({ mail_status: outcome.status })
}
