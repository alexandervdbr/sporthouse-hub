import { createClient, createAdminClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { isAdminUser } from '@/lib/auth-permissions'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(user)) return new Response('Forbidden', { status: 403 })

  if (!process.env.VAPID_EMAIL || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return new Response('Push-notificaties zijn niet geconfigureerd.', { status: 503 })
  }
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const { title, body, url, excludeUserId } = await req.json()

  const admin = createAdminClient()
  let query = admin.from('push_subscriptions').select('*')
  if (excludeUserId) query = query.neq('user_id', excludeUserId)

  const { data: subscriptions } = await query

  if (!subscriptions?.length) return Response.json({ sent: 0 })

  const payload = JSON.stringify({ title, body, url: url || '/dashboard' })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return Response.json({ sent })
}
