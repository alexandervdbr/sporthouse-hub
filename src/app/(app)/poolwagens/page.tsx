import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { poolwagenAccess } from '@/lib/poolwagens/access'

export const metadata = { title: 'Poolwagens — Sporthouse' }

// Tijdelijk: het planningsoverzicht komt in de volgende stap op deze plek.
// Tot dan gaat beheer door naar /poolwagens/beheer.
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = poolwagenAccess(user)
  redirect(access.manage ? '/poolwagens/beheer' : '/dashboard')
}
