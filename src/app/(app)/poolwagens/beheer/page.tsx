import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PoolwagenBeheer from '@/components/poolwagens/PoolwagenBeheer'
import { poolwagenAccess } from '@/lib/poolwagens/access'

export const metadata = { title: 'Poolwagens beheren — Sporthouse' }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De zijbalk en de (app)-layout kijken niet naar secties; daarom hier.
  const access = poolwagenAccess(user)
  if (!access.manage) redirect(access.use ? '/poolwagens' : '/dashboard')

  return <PoolwagenBeheer />
}
