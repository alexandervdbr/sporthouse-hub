import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MateriaalPlanner from '@/components/materiaal/MateriaalPlanner'
import { gearAccess } from '@/lib/gear/access'

export const metadata = { title: 'Materiaal — Sporthouse' }

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De zijbalk en de (app)-layout kijken niet naar secties; daarom hier.
  const access = gearAccess(user)
  if (!access.view) redirect('/dashboard')

  const { view, date } = await searchParams
  return <MateriaalPlanner userId={user.id} access={access} initialView={view} initialDate={date} />
}
