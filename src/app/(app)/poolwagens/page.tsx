import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PoolwagenPlanner from '@/components/poolwagens/PoolwagenPlanner'
import { poolwagenAccess } from '@/lib/poolwagens/access'

export const metadata = { title: 'Poolwagens — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De zijbalk en de (app)-layout kijken niet naar secties; daarom hier.
  const access = poolwagenAccess(user)
  if (!access.use) redirect('/dashboard')

  return <PoolwagenPlanner userId={user.id} access={access} />
}
