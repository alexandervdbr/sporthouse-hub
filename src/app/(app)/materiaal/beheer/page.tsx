import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InventoryTree from '@/components/materiaal/InventoryTree'
import { gearAccess } from '@/lib/gear/access'

export const metadata = { title: 'Materiaal beheren — Sporthouse' }

export default async function Page({ searchParams }: { searchParams: Promise<{ kit?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De zijbalk en de (app)-layout kijken niet naar secties; daarom hier.
  const access = gearAccess(user)
  if (!access.manageCatalog) redirect(access.view ? '/materiaal' : '/dashboard')

  const { kit } = await searchParams
  return <InventoryTree access={access} initialKitId={typeof kit === 'string' ? kit : null} />
}
