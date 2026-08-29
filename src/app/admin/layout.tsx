import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { Client } from '@/types/database'
import { isAdminUser } from '@/lib/auth-permissions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = isAdminUser(user)
  if (!isAdmin) redirect('/dashboard')

  const { data: clients } = await supabase.from('clients').select('*').order('name')

  return (
    <AppShell clients={(clients as Client[]) || []}>
      {children}
    </AppShell>
  )
}
