import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function GET() {
  const headersList = await headers()
  const auth = headersList.get('authorization')

  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return new Response(error.message, { status: 500 })

  const now = new Date()
  const expired = users.filter(u => {
    const expiresAt = u.user_metadata?.expires_at
    return expiresAt && new Date(expiresAt) <= now
  })

  const results = await Promise.allSettled(
    expired.map(u => admin.auth.admin.deleteUser(u.id))
  )

  const deleted = results.filter(r => r.status === 'fulfilled').length
  const failed  = results.filter(r => r.status === 'rejected').length

  return Response.json({ checked: users.length, expired: expired.length, deleted, failed })
}
