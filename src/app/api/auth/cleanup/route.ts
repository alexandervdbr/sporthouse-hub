import { createClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/auth-permissions'

// Called after a Google login for a user who is not allowed.
// Deletes the auto-created Supabase record so they don't appear in the admin panel.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(null, { status: 200 })

  const isAllowed =
    ADMIN_EMAILS.includes(user.email ?? '') ||
    user.app_metadata?.allowed === true

  if (!isAllowed) {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
      {
        method: 'DELETE',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      }
    )
    await supabase.auth.signOut()
  }

  return new Response(null, { status: 200 })
}
