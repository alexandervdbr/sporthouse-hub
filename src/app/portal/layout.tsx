import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import PortalLogout from '@/components/portal/PortalLogout'

const ADMIN_EMAILS = ['arne.smets@sporthousegroup.com', 'deryan.spiessens@sporthousegroup.com']

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admins should not be in the portal
  const sections: string[] = user.user_metadata?.permissions?.sections ?? []
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '') || sections.includes('beheer')
  if (isAdmin) redirect('/dashboard')

  // Must be a freelancer
  const admin = createAdminClient()
  const { data: freelancer } = await admin
    .from('freelancers')
    .select('id, name')
    .eq('email', user.email)
    .maybeSingle()

  if (!freelancer) redirect('/login')

  return (
    <div className="min-h-screen" style={{ background: '#0d0d0d' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: 'rgba(13,13,13,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Sporthouse" width={100} height={26} className="object-contain" style={{ filter: 'invert(1)', opacity: 0.85 }} />
          <span className="text-zinc-700 text-sm">|</span>
          <span className="text-sm text-zinc-400 font-medium">Freelancer Portaal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">{freelancer.name}</span>
          <PortalLogout />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  )
}
