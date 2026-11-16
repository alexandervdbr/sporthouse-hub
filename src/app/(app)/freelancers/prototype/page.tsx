import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth-permissions'
import Prototype from '@/features/freelancers/prototype/Prototype'

export const metadata = { title: 'Freelancers (prototype) — Sporthouse' }

// Klikbaar voorstel voor de herwerkte freelancerschermen, met nepdata.
// Alleen voor admins; leest en schrijft niets in de database.
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!isAdminUser(user)) redirect('/freelancers')
  return <Suspense><Prototype /></Suspense>
}
