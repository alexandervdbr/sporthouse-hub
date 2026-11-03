import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { gearAccess } from '@/lib/gear/access'

export const metadata = { title: 'Materiaal — Sporthouse' }

// Tijdelijk: het raster met boekingen komt in stap 6 op deze plek. Tot dan
// verwijst deze pagina naar Beheer, zodat de kruimelpaden ergens heen gaan.
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = gearAccess(user)
  if (!access.view) redirect('/dashboard')
  if (access.manageCatalog) redirect('/materiaal/beheer')

  return (
    <div className="p-8 max-w-xl mx-auto text-center">
      <h1 className="text-base font-semibold text-zinc-100">Materiaalplanner</h1>
      <p className="mt-2 text-sm text-zinc-500">De planning komt hier binnenkort. <Link href="/dashboard" className="underline">Terug naar het dashboard</Link></p>
    </div>
  )
}
