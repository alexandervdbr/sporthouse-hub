import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ItemDetail from '@/components/materiaal/ItemDetail'
import { gearAccess } from '@/lib/gear/access'

export const metadata = { title: 'Materiaal — Sporthouse' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De zijbalk en de (app)-layout kijken niet naar secties; daarom hier.
  const access = gearAccess(user)
  if (!access.view) redirect('/dashboard')

  const { id } = await params
  return <ItemDetail itemId={id} access={access} />
}
