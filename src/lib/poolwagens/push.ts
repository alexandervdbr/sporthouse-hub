import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

// Web-push naar bepaalde collega's, met de bestaande push-infrastructuur:
// dezelfde tabel push_subscriptions, dezelfde VAPID-sleutels en dezelfde
// service worker (public/sw.js) als /api/push/send. Die route stuurt naar
// iedereen en is alleen voor admins; hier gaat het naar een paar accounts,
// dus de paar regels staan hier apart in plaats van die route te wijzigen.
//
// De service-sleutel leest alleen (welke toestellen bij die accounts horen).
// Verlopen abonnementen worden niet opgeruimd; dat blijft /api/push/send doen.
// Gooit nooit: een push is een extraatje, nooit een voorwaarde.

export interface PushPayload {
  title: string
  body: string
  url: string
}

export function isPushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.VAPID_EMAIL && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0 || !isPushConfigured()) return 0
  try {
    webpush.setVapidDetails(process.env.VAPID_EMAIL!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    const { data: subs, error } = await createAdminClient()
      .from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
    if (error || !subs?.length) return 0
    const body = JSON.stringify(payload)
    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)),
    )
    return results.filter(r => r.status === 'fulfilled').length
  } catch (err) {
    console.error('Poolwagens: push niet verstuurd:', err instanceof Error ? err.message : err)
    return 0
  }
}
