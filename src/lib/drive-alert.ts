import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

// Een storing bij Google vastleggen, en er één keer iemand voor wakker maken.
//
// Aangeroepen vanuit withDriveRetry (lib/drive-storage) op het moment dat die
// het opgeeft: vier pogingen gedaan, fout komt van Google, de gebruiker ziet
// nu een foutmelding. Dat is het enige moment dat dit hoort te gebeuren —
// niet bij elke hapering onderweg, want die vangen de herpogingen al op.
//
// Niets hierin mag de aanroeper raken. Er is net al iets misgegaan; dat
// verergeren door ook nog op een mislukte notificatie te stranden is het
// laatste wat helpt. Vandaar dat alles in een try zit en er nooit iets
// omhoog gegooid wordt.

const COOLDOWN = '30 minutes'

export async function recordDriveIncident(source: string, err: unknown): Promise<void> {
  try {
    const admin = createAdminClient()
    const message = (err as Error)?.message?.slice(0, 500) ?? 'onbekend'

    const { data: incident, error } = await admin
      .from('drive_incidents')
      .insert({ source, message })
      .select('id, occurred_at')
      .single()

    if (error || !incident) {
      console.error('Kon Drive-storing niet vastleggen:', error?.message)
      return
    }

    // Eén melding per storing. De database beslist wie hem stuurt, want
    // serverless-aanroepen draaien naast elkaar en weten niets van elkaar.
    const { data: mayAlert } = await admin.rpc('claim_drive_alert', {
      incident: incident.id,
      cooldown: COOLDOWN,
    })
    if (mayAlert !== true) return

    await notifyAdmins(source, message)
  } catch (err) {
    console.error('Drive-storing melden mislukt:', err instanceof Error ? err.message : err)
  }
}

// Push naar de admins, via dezelfde weg die de chat al gebruikt. Geen e-mail:
// daar is geen voorziening voor, en een melding op je telefoon is sneller dan
// een mail die je morgenvroeg leest.
async function notifyAdmins(source: string, message: string): Promise<void> {
  const { VAPID_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_EMAIL || !NEXT_PUBLIC_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('Drive-storing: push niet geconfigureerd, geen melding verstuurd.')
    return
  }

  const admin = createAdminClient()

  // Wie admin is staat in app_metadata, niet in een tabel die we kunnen
  // joinen — vandaar deze omweg. Hij loopt alleen bij een storing, dus
  // hooguit twee keer per uur.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
  const adminIds = (users?.users ?? [])
    .filter(u => {
      const sections = (u.app_metadata?.permissions as { sections?: string[] } | undefined)?.sections ?? []
      return sections.includes('beheer') || ADMIN_EMAILS.includes(u.email ?? '')
    })
    .map(u => u.id)

  if (!adminIds.length) return

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminIds)

  if (!subscriptions?.length) return

  webpush.setVapidDetails(VAPID_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // Een eigen tag, want notificaties met dezelfde tag vervangen elkaar op het
  // scherm. De chat stuurt er geen mee en valt dus terug op 'default' — zonder
  // dit zou het eerstvolgende chatbericht deze melding wegdrukken, of
  // andersom. Twee storingen kort na elkaar overschrijven elkaar wél, en dat
  // klopt: het is dezelfde storing.
  const payload = JSON.stringify({
    title: 'Google Drive heeft een storing',
    body: `Uploads en downloads lopen nu mis (${source}). Collega's zien een melding in de app.`,
    url: '/dashboard',
    tag: 'drive-storing',
  })

  await Promise.all(subscriptions.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    } catch {
      // Een toestel dat zijn abonnement kwijt is, is geen reden om de rest
      // niet te bereiken.
    }
  }))

  console.warn(`Drive-storing gemeld aan ${adminIds.length} admin(s): ${source} — ${message}`)
}
