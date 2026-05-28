import { createClient, createAdminClient } from '@/lib/supabase/server'
import webpush from 'web-push'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  if (!isAdmin) return new Response('Forbidden', { status: 403 })

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
