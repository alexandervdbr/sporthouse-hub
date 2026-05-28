import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

// Called after a Google login for a user who is not allowed.
// Deletes the auto-created Supabase record so they don't appear in the admin panel.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(null, { status: 200 })

  const isAllowed =
    ADMIN_EMAILS.includes(user.email ?? '') ||
    user.user_metadata?.allowed === true

  if (!isAllowed) {
    const admin = createAdminClient()
    await admin.auth.admin.deleteUser(user.id)
    await supabase.auth.signOut()
  }

  return new Response(null, { status: 200 })
}
