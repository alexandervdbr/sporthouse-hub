import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/auth-permissions'

// Nested inside (app)/layout.tsx, which already provides AppShell — this
// only adds the extra isAdmin-only gate specific to this section.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!isAdminUser(user)) redirect('/dashboard')

  return children
}
