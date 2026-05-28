import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EquipmentStats from '@/components/equipment/EquipmentStats'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export default async function EquipmentStatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const permsObj = user.user_metadata?.permissions ?? null
  const sections: string[] = permsObj?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  const hasAccess = isAdmin || permsObj === null || sections.includes('stats_materiaal')
  if (!hasAccess) redirect('/equipment')

  return <EquipmentStats />
}
