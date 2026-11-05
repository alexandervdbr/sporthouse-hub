import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Historiek from '@/components/poolwagens/Historiek'
import { poolwagenAccess } from '@/lib/poolwagens/access'

export const metadata = { title: 'Historiek poolwagens — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = poolwagenAccess(user)
  if (!access.use) redirect('/dashboard')

  return <Historiek access={access} />
}
