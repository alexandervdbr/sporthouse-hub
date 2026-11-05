import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchadeLijst from '@/components/poolwagens/SchadeLijst'
import { poolwagenAccess } from '@/lib/poolwagens/access'

export const metadata = { title: 'Schade poolwagens — Sporthouse' }

export default async function Page({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = poolwagenAccess(user)
  if (!access.use) redirect('/dashboard')

  const { melding } = await searchParams
  return <SchadeLijst access={access} highlight={typeof melding === 'string' ? melding : null} />
}
