import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UnitDetail from '@/components/materiaal/UnitDetail'
import { gearAccess } from '@/lib/gear/access'

export const metadata = { title: 'Materiaal — Sporthouse' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = gearAccess(user)
  if (!access.view) redirect('/dashboard')

  const { id } = await params
  return <UnitDetail unitId={id} access={access} />
}
